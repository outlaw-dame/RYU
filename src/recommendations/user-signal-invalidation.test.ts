import { describe, expect, it, vi } from "vitest";
import { createUserSignalInvalidationBus } from "./user-signal-invalidation";

class FakeChannel {
  static channels = new Set<FakeChannel>();
  onmessage: ((event: { data: unknown }) => void) | null = null;
  closed = false;

  constructor(readonly name: string) {
    FakeChannel.channels.add(this);
  }

  postMessage(message: unknown): void {
    for (const channel of FakeChannel.channels) {
      if (channel === this || channel.closed || channel.name !== this.name) continue;
      channel.onmessage?.({ data: message });
    }
  }

  close(): void {
    this.closed = true;
    FakeChannel.channels.delete(this);
  }
}

const scopeA = { ownerAccountId: "owner-a", instanceOrigin: "https://books.example" };
const scopeB = { ownerAccountId: "owner-b", instanceOrigin: "https://books.example" };

function createHarness(sourceId: string) {
  const scheduled: Array<() => void> = [];
  const bus = createUserSignalInvalidationBus({
    sourceId,
    createChannel: (name) => new FakeChannel(name),
    schedule: (callback) => scheduled.push(callback)
  });
  return {
    bus,
    flush() {
      while (scheduled.length > 0) scheduled.shift()?.();
    }
  };
}

describe("user signal invalidation bus", () => {
  it("notifies only matching account and instance scopes", () => {
    const first = createHarness("tab-a");
    const second = createHarness("tab-b");
    const sameScope = vi.fn();
    const foreignScope = vi.fn();
    second.bus.subscribe(scopeA, sameScope);
    second.bus.subscribe(scopeB, foreignScope);

    first.bus.publish(scopeA);
    first.flush();

    expect(sameScope).toHaveBeenCalledTimes(1);
    expect(foreignScope).not.toHaveBeenCalled();
    first.bus.dispose();
    second.bus.dispose();
  });

  it("delivers canonical scope to global subscribers", () => {
    const first = createHarness("tab-a");
    const second = createHarness("tab-b");
    const listener = vi.fn();
    second.bus.subscribeAll(listener);

    first.bus.publish({ ownerAccountId: " owner-a ", instanceOrigin: "https://books.example/" });
    first.flush();

    expect(listener).toHaveBeenCalledWith(scopeA);
    first.bus.dispose();
    second.bus.dispose();
  });

  it("coalesces repeated writes for one scope into one invalidation", () => {
    const first = createHarness("tab-a");
    const second = createHarness("tab-b");
    const listener = vi.fn();
    second.bus.subscribe(scopeA, listener);

    first.bus.publish(scopeA);
    first.bus.publish(scopeA);
    first.bus.publish({ ...scopeA });
    first.flush();

    expect(listener).toHaveBeenCalledTimes(1);
    first.bus.dispose();
    second.bus.dispose();
  });

  it("notifies same-tab subscribers without accepting its own channel echo", () => {
    const harness = createHarness("tab-a");
    const listener = vi.fn();
    harness.bus.subscribe(scopeA, listener);

    harness.bus.publish(scopeA);
    harness.flush();

    expect(listener).toHaveBeenCalledTimes(1);
    harness.bus.dispose();
  });

  it("ignores malformed and foreign-version messages", () => {
    const harness = createHarness("tab-a");
    const listener = vi.fn();
    harness.bus.subscribe(scopeA, listener);
    const attacker = new FakeChannel("ryu.user-signal-invalidation.v1");

    attacker.postMessage({ version: 2, sourceId: "x", ...scopeA });
    attacker.postMessage({ version: 1, sourceId: "x", ownerAccountId: "", instanceOrigin: scopeA.instanceOrigin });
    attacker.postMessage({ version: 1, sourceId: "x", ownerAccountId: scopeA.ownerAccountId, instanceOrigin: "http://evil.example" });

    expect(listener).not.toHaveBeenCalled();
    attacker.close();
    harness.bus.dispose();
  });

  it("stops all delivery after disposal", () => {
    const first = createHarness("tab-a");
    const second = createHarness("tab-b");
    const listener = vi.fn();
    second.bus.subscribe(scopeA, listener);
    second.bus.dispose();

    first.bus.publish(scopeA);
    first.flush();

    expect(listener).not.toHaveBeenCalled();
    first.bus.dispose();
  });
});
