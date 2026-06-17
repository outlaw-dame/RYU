import { afterEach, describe, expect, it, vi } from "vitest";
import { createMultiTabCoordinator } from "../multiTabCoordination";

type Listener = (event: MessageEvent) => void;

/**
 * Build an in-memory broadcast bus so tests can simulate multiple tabs
 * cooperating without depending on real BroadcastChannel.
 */
function createInMemoryBus() {
  const channels = new Map<string, Array<{ listeners: Set<Listener> }>>();
  return {
    create(name: string) {
      const peers: Array<{ listeners: Set<Listener> }> = channels.get(name) ?? [];
      const self = { listeners: new Set<Listener>() };
      peers.push(self);
      channels.set(name, peers);
      return {
        postMessage(message: unknown) {
          for (const peer of peers) {
            if (peer === self) continue;
            for (const listener of peer.listeners) {
              listener({ data: message } as MessageEvent);
            }
          }
        },
        addEventListener(event: "message", listener: Listener) {
          if (event === "message") self.listeners.add(listener);
        },
        removeEventListener(event: "message", listener: Listener) {
          if (event === "message") self.listeners.delete(listener);
        },
        close() {
          self.listeners.clear();
          const idx = peers.indexOf(self);
          if (idx >= 0) peers.splice(idx, 1);
        }
      };
    }
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("createMultiTabCoordinator", () => {
  it("falls back to single-tab leader when BroadcastChannel is unavailable", () => {
    const coordinator = createMultiTabCoordinator({
      createChannel: () => null
    });
    expect(coordinator.isLeader()).toBe(true);
    coordinator.stop();
  });

  it("a single tab becomes leader after the election window", async () => {
    vi.useFakeTimers();
    const bus = createInMemoryBus();
    const coordinator = createMultiTabCoordinator({
      channelName: "test",
      createChannel: (name) => bus.create(name)
    });
    expect(coordinator.isLeader()).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(coordinator.isLeader()).toBe(true);
    coordinator.stop();
  });

  it("only ONE of two peers is leader at a time", async () => {
    vi.useFakeTimers();
    const bus = createInMemoryBus();
    const a = createMultiTabCoordinator({
      channelName: "duo",
      createChannel: (name) => bus.create(name)
    });
    const b = createMultiTabCoordinator({
      channelName: "duo",
      createChannel: (name) => bus.create(name)
    });

    await vi.advanceTimersByTimeAsync(700);
    const leaderCount = [a, b].filter((c) => c.isLeader()).length;
    expect(leaderCount).toBe(1);
    a.stop();
    b.stop();
  });

  it("notifies subscribers when leadership changes", async () => {
    vi.useFakeTimers();
    const bus = createInMemoryBus();
    const observed: boolean[] = [];
    const coordinator = createMultiTabCoordinator({
      channelName: "subs",
      createChannel: (name) => bus.create(name)
    });
    coordinator.subscribe((isLeader) => observed.push(isLeader));

    // Initial subscribe-time delivery
    expect(observed[0]).toBe(false);

    await vi.advanceTimersByTimeAsync(600);
    expect(observed[observed.length - 1]).toBe(true);

    coordinator.stop();
  });

  it("subscriber errors do not break the coordinator", async () => {
    vi.useFakeTimers();
    const bus = createInMemoryBus();
    const goodListener = vi.fn();
    const coordinator = createMultiTabCoordinator({
      channelName: "errs",
      createChannel: (name) => bus.create(name)
    });
    coordinator.subscribe(() => {
      throw new Error("listener crashed");
    });
    coordinator.subscribe(goodListener);

    await vi.advanceTimersByTimeAsync(600);
    expect(goodListener).toHaveBeenCalled();
    coordinator.stop();
  });

  it("stop() releases the leader and lets a remaining peer take over", async () => {
    vi.useFakeTimers();
    const bus = createInMemoryBus();
    const a = createMultiTabCoordinator({
      channelName: "trade",
      createChannel: (name) => bus.create(name)
    });
    const b = createMultiTabCoordinator({
      channelName: "trade",
      createChannel: (name) => bus.create(name)
    });
    await vi.advanceTimersByTimeAsync(700);

    // One of them is now leader. Stop that one and verify the other
    // takes over after a fresh election.
    const initialLeader = a.isLeader() ? a : b;
    const peer = a.isLeader() ? b : a;
    initialLeader.stop();

    // Step-down message triggers election in peer.
    await vi.advanceTimersByTimeAsync(700);
    expect(peer.isLeader()).toBe(true);
    peer.stop();
  });
});
