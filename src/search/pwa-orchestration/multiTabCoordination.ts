/**
 * Phase 15 — Multi-tab leader election.
 *
 * BroadcastChannel-based coordination so only one tab at a time runs
 * heavy backfill / repair indexing. Without this, every open tab would
 * race to embed the same documents, doubling CPU and memory cost.
 *
 * Protocol:
 *   1. On startup, each tab generates a random `tabId` and broadcasts
 *      a `claim` message asking who is leader.
 *   2. The current leader (if any) responds with `leader-pong` carrying
 *      its tabId and lastSeenAt.
 *   3. After a short election window (default 500ms) the tab with the
 *      lowest tabId among all responders wins. The winner broadcasts
 *      `leader-announce` and starts heartbeating.
 *   4. Heartbeat every 15 seconds. If no heartbeat is observed for 45
 *      seconds, peers re-run the election.
 *   5. On `pagehide` or `freeze` the leader broadcasts `leader-step-down`
 *      so peers can elect a successor without waiting for the heartbeat
 *      timeout.
 *
 * The implementation tolerates missing BroadcastChannel (Safari ≤ 15 in
 * private mode, some service-worker contexts) by treating the current
 * tab as the sole leader. Single-tab callers therefore always proceed.
 */

const CHANNEL_NAME = "ryu.search.pwa-orchestration.v1";
const HEARTBEAT_INTERVAL_MS = 15_000;
const HEARTBEAT_TIMEOUT_MS = 45_000;
const ELECTION_WINDOW_MS = 500;

type CoordinationMessage =
  | { kind: "claim"; tabId: string }
  | { kind: "leader-pong"; tabId: string; lastSeenAt: number }
  | { kind: "leader-announce"; tabId: string }
  | { kind: "leader-heartbeat"; tabId: string; at: number }
  | { kind: "leader-step-down"; tabId: string };

type LeaderListener = (isLeader: boolean) => void;

type BroadcastChannelLike = {
  postMessage: (message: unknown) => void;
  addEventListener: (event: "message", listener: (event: MessageEvent) => void) => void;
  removeEventListener: (event: "message", listener: (event: MessageEvent) => void) => void;
  close: () => void;
};

type Coordinator = {
  isLeader(): boolean;
  subscribe(listener: LeaderListener): () => void;
  stop(): void;
};

function generateTabId(): string {
  // 96-bit random tabId. Cryptographic strength is not required —
  // collisions only matter if two tabs pick identical ids, which is
  // negligible at this size.
  const bytes = new Uint8Array(12);
  if (typeof crypto !== "undefined" && typeof crypto.getRandomValues === "function") {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function tryOpenChannel(name: string): BroadcastChannelLike | null {
  if (typeof BroadcastChannel === "undefined") return null;
  try {
    const channel = new BroadcastChannel(name);
    return channel as unknown as BroadcastChannelLike;
  } catch {
    return null;
  }
}

export type CreateCoordinatorOptions = {
  /** Override the channel name (used by tests). */
  channelName?: string;
  /** Inject a synthetic clock for tests. */
  now?: () => number;
  /**
   * Optional channel factory so tests can supply an in-memory transport.
   * If omitted, the global BroadcastChannel is used (and the coordinator
   * falls back to single-tab leader when unavailable).
   */
  createChannel?: (name: string) => BroadcastChannelLike | null;
};

/**
 * Create a multi-tab coordinator. Idempotent — callers should reuse a
 * single instance per page.
 */
export function createMultiTabCoordinator(
  options: CreateCoordinatorOptions = {}
): Coordinator {
  const channelName = options.channelName ?? CHANNEL_NAME;
  const now = options.now ?? Date.now;
  const factory = options.createChannel ?? tryOpenChannel;

  const tabId = generateTabId();
  const listeners = new Set<LeaderListener>();
  const channel = factory(channelName);

  let isLeader = false;
  let leaderId: string | null = null;
  let lastLeaderHeartbeatAt = 0;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let electionTimeout: ReturnType<typeof setTimeout> | null = null;
  let electionResponders = new Set<string>();
  let stopped = false;

  function emit(): void {
    for (const listener of listeners) {
      try {
        listener(isLeader);
      } catch {
        // Subscriber errors must never break the coordinator.
      }
    }
  }

  function setLeader(next: boolean, who: string | null): void {
    const changed = next !== isLeader || who !== leaderId;
    isLeader = next;
    leaderId = who;
    if (changed) emit();
  }

  function send(message: CoordinationMessage): void {
    if (!channel || stopped) return;
    try {
      channel.postMessage(message);
    } catch {
      // Channel may be closed; ignore.
    }
  }

  function clearElection(): void {
    if (electionTimeout !== null) {
      clearTimeout(electionTimeout);
      electionTimeout = null;
    }
    electionResponders.clear();
  }

  function startHeartbeat(): void {
    if (heartbeatInterval !== null) return;
    heartbeatInterval = setInterval(() => {
      if (!isLeader || stopped) return;
      send({ kind: "leader-heartbeat", tabId, at: now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  function stopHeartbeat(): void {
    if (heartbeatInterval !== null) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
  }

  function becomeLeader(): void {
    setLeader(true, tabId);
    lastLeaderHeartbeatAt = now();
    send({ kind: "leader-announce", tabId });
    startHeartbeat();
  }

  function startElection(): void {
    if (stopped) return;
    clearElection();
    electionResponders = new Set<string>([tabId]);
    send({ kind: "claim", tabId });
    electionTimeout = setTimeout(() => {
      electionTimeout = null;
      // The candidate with the lexicographically lowest tabId wins.
      // This is deterministic across tabs because every tab observes
      // the same set of responders within the same election window.
      const winner = Array.from(electionResponders).sort()[0];
      electionResponders.clear();
      if (winner === tabId) {
        becomeLeader();
      } else {
        setLeader(false, winner ?? null);
        stopHeartbeat();
      }
    }, ELECTION_WINDOW_MS);
  }

  function handleMessage(event: MessageEvent<CoordinationMessage>): void {
    // After stop() we must not participate in further elections — our
    // listener is still attached briefly during teardown but we have no
    // intent of being leader anymore.
    if (stopped) return;
    const message = event.data;
    if (!message || typeof message !== "object" || !("kind" in message)) return;
    if (message.tabId === tabId && message.kind !== "leader-announce") return;

    switch (message.kind) {
      case "claim": {
        // Reply if we are the active leader so the new tab learns of us.
        if (isLeader) {
          send({ kind: "leader-pong", tabId, lastSeenAt: now() });
        }
        // Whether or not we are leader, every active tab joins the
        // election so a fresh leader can be elected after a crash.
        electionResponders.add(message.tabId);
        if (electionTimeout === null) {
          // Another tab triggered the election; we still need to
          // announce ourselves so the lowest-id rule converges.
          electionResponders.add(tabId);
          send({ kind: "leader-pong", tabId, lastSeenAt: now() });
        }
        return;
      }
      case "leader-pong": {
        electionResponders.add(message.tabId);
        return;
      }
      case "leader-announce": {
        clearElection();
        if (message.tabId === tabId) {
          // Echo of our own announcement.
          return;
        }
        // Another tab is leader — defer.
        if (isLeader) {
          stopHeartbeat();
        }
        setLeader(false, message.tabId);
        lastLeaderHeartbeatAt = now();
        return;
      }
      case "leader-heartbeat": {
        if (message.tabId === leaderId) {
          lastLeaderHeartbeatAt = now();
          return;
        }
        // Heartbeat from someone we did not know was leader; trust it
        // and stop running our own heartbeat if we were leader.
        if (isLeader) stopHeartbeat();
        setLeader(false, message.tabId);
        lastLeaderHeartbeatAt = now();
        return;
      }
      case "leader-step-down": {
        if (message.tabId !== leaderId) return;
        setLeader(false, null);
        startElection();
        return;
      }
    }
  }

  function checkLeaderTimeout(): void {
    if (isLeader || leaderId === null || stopped) return;
    if (now() - lastLeaderHeartbeatAt > HEARTBEAT_TIMEOUT_MS) {
      setLeader(false, null);
      startElection();
    }
  }

  // Periodic check for dead leaders. We piggyback on the heartbeat
  // interval so a single timer drives both leader and follower duties.
  const watchdog = setInterval(checkLeaderTimeout, HEARTBEAT_INTERVAL_MS);

  if (channel) {
    const messageHandler = (event: MessageEvent) => handleMessage(event as MessageEvent<CoordinationMessage>);
    channel.addEventListener("message", messageHandler);
    startElection();

    return {
      isLeader: () => isLeader,
      subscribe(listener) {
        listeners.add(listener);
        try {
          listener(isLeader);
        } catch {
          // Subscriber errors must never break the coordinator.
        }
        return () => {
          listeners.delete(listener);
        };
      },
      stop() {
        if (stopped) return;
        // Broadcast step-down before tearing down so peers can run a
        // fresh election immediately rather than waiting the full
        // heartbeat timeout. We bypass the send() helper because we
        // need to do this AFTER setting stopped (so handleMessage
        // refuses any echoes that a peer's response triggers) but
        // BEFORE removing the channel listener.
        const wasLeader = isLeader;
        stopped = true;
        if (wasLeader && channel) {
          try {
            channel.postMessage({ kind: "leader-step-down", tabId });
          } catch {
            // ignore — peers will still recover via heartbeat timeout
          }
        }
        clearInterval(watchdog);
        clearElection();
        stopHeartbeat();
        channel.removeEventListener("message", messageHandler);
        try {
          channel.close();
        } catch {
          // ignore
        }
        listeners.clear();
      }
    };
  }

  // No BroadcastChannel — assume single-tab leader so callers proceed.
  setLeader(true, tabId);
  return {
    isLeader: () => isLeader,
    subscribe(listener) {
      listeners.add(listener);
      try {
        listener(isLeader);
      } catch {
        // Subscriber errors must never break the coordinator.
      }
      return () => {
        listeners.delete(listener);
      };
    },
    stop() {
      stopped = true;
      clearInterval(watchdog);
      listeners.clear();
    }
  };
}
