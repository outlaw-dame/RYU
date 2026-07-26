import type { UserSignalScope } from "./user-signal-store";
import { normalizeInstanceOrigin } from "./user-signals";

const CHANNEL_NAME = "ryu.user-signal-invalidation.v1";
const MAX_SCOPE_PART_LENGTH = 2048;

type BroadcastChannelLike = {
  postMessage(message: unknown): void;
  close(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
};

type InvalidationEnvelope = Readonly<{
  version: 1;
  sourceId: string;
  ownerAccountId: string;
  instanceOrigin: string;
}>;

export type UserSignalInvalidationBus = {
  publish(scope: UserSignalScope): void;
  subscribe(scope: UserSignalScope, listener: () => void): () => void;
  dispose(): void;
};

export type UserSignalInvalidationBusOptions = {
  sourceId?: string;
  createChannel?: (name: string) => BroadcastChannelLike | null;
  schedule?: (callback: () => void) => void;
};

export function createUserSignalInvalidationBus(
  options: UserSignalInvalidationBusOptions = {}
): UserSignalInvalidationBus {
  const sourceId = options.sourceId ?? createSourceId();
  const createChannel = options.createChannel ?? createBrowserChannel;
  const schedule = options.schedule ?? queueMicrotask;
  const listeners = new Map<string, Set<() => void>>();
  const pendingScopes = new Map<string, UserSignalScope>();
  let channel: BroadcastChannelLike | null = null;
  let disposed = false;
  let flushScheduled = false;

  function ensureChannel(): BroadcastChannelLike | null {
    if (disposed) return null;
    if (channel) return channel;
    channel = createChannel(CHANNEL_NAME);
    if (channel) {
      channel.onmessage = (event) => {
        const envelope = parseEnvelope(event.data);
        if (!envelope || envelope.sourceId === sourceId) return;
        notify({
          ownerAccountId: envelope.ownerAccountId,
          instanceOrigin: envelope.instanceOrigin
        });
      };
    }
    return channel;
  }

  function notify(scope: UserSignalScope): void {
    const key = scopeKey(scope);
    for (const listener of [...(listeners.get(key) ?? [])]) listener();
  }

  function flush(): void {
    flushScheduled = false;
    if (disposed) return;
    const queued = [...pendingScopes.values()];
    pendingScopes.clear();
    const activeChannel = ensureChannel();
    for (const scope of queued) {
      notify(scope);
      activeChannel?.postMessage(Object.freeze({
        version: 1,
        sourceId,
        ownerAccountId: scope.ownerAccountId,
        instanceOrigin: scope.instanceOrigin
      }) satisfies InvalidationEnvelope);
    }
  }

  return Object.freeze({
    publish(scope) {
      if (disposed) return;
      const canonicalScope = normalizeScope(scope);
      pendingScopes.set(scopeKey(canonicalScope), canonicalScope);
      if (flushScheduled) return;
      flushScheduled = true;
      schedule(flush);
    },

    subscribe(scope, listener) {
      if (disposed) return () => undefined;
      const canonicalScope = normalizeScope(scope);
      const key = scopeKey(canonicalScope);
      const scoped = listeners.get(key) ?? new Set<() => void>();
      scoped.add(listener);
      listeners.set(key, scoped);
      ensureChannel();

      let released = false;
      return () => {
        if (released) return;
        released = true;
        scoped.delete(listener);
        if (scoped.size === 0) listeners.delete(key);
      };
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      pendingScopes.clear();
      listeners.clear();
      if (channel) {
        channel.onmessage = null;
        channel.close();
        channel = null;
      }
    }
  });
}

const sharedBus = createUserSignalInvalidationBus();

export function publishUserSignalInvalidation(scope: UserSignalScope): void {
  sharedBus.publish(scope);
}

export function subscribeUserSignalInvalidation(
  scope: UserSignalScope,
  listener: () => void
): () => void {
  return sharedBus.subscribe(scope, listener);
}

function normalizeScope(scope: UserSignalScope): UserSignalScope {
  const ownerAccountId = typeof scope.ownerAccountId === "string"
    ? scope.ownerAccountId.trim()
    : "";
  if (!ownerAccountId) throw new Error("User signal owner account ID is required");
  if (ownerAccountId.length > MAX_SCOPE_PART_LENGTH) {
    throw new Error("User signal owner account ID is too long");
  }
  return {
    ownerAccountId,
    instanceOrigin: normalizeInstanceOrigin(scope.instanceOrigin)
  };
}

function scopeKey(scope: UserSignalScope): string {
  return JSON.stringify([scope.ownerAccountId, scope.instanceOrigin]);
}

function parseEnvelope(value: unknown): InvalidationEnvelope | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<InvalidationEnvelope>;
  if (candidate.version !== 1) return null;
  if (!isBoundedString(candidate.sourceId, 256)) return null;
  if (!isBoundedString(candidate.ownerAccountId, MAX_SCOPE_PART_LENGTH)) return null;
  if (!isBoundedString(candidate.instanceOrigin, MAX_SCOPE_PART_LENGTH)) return null;

  try {
    const scope = normalizeScope({
      ownerAccountId: candidate.ownerAccountId,
      instanceOrigin: candidate.instanceOrigin
    });
    return Object.freeze({ version: 1, sourceId: candidate.sourceId, ...scope });
  } catch {
    return null;
  }
}

function isBoundedString(value: unknown, maximum: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maximum;
}

function createBrowserChannel(name: string): BroadcastChannelLike | null {
  if (typeof window === "undefined" || typeof window.BroadcastChannel !== "function") return null;
  return new window.BroadcastChannel(name);
}

function createSourceId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
