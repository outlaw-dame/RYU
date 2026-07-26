import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addBlock, loadBlockList } from "./block-store";
import { addContentFilter, loadContentFilters } from "./content-filter";
import { mergeRemoteModerationState } from "./remote-merge";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

beforeEach(() => vi.stubGlobal("localStorage", new MemoryStorage()));
afterEach(() => vi.unstubAllGlobals());

describe("remote moderation merge", () => {
  it("union-merges remote state without removing local safety decisions", () => {
    addBlock("local-only", "local@example");
    mergeRemoteModerationState({
      mutes: [{ id: "remote-mute", acct: "muted@example" }],
      blocks: [{ id: "remote-block", acct: "blocked@example" }],
      domains: ["HTTPS://Spam.Example/path"],
      filters: []
    });
    expect(loadBlockList().map((entry) => entry.accountId).sort()).toEqual(["local-only", "remote-block"]);
    expect(JSON.parse(localStorage.getItem("ryu:mute-list") ?? "[]")[0].accountId).toBe("remote-mute");
    expect(JSON.parse(localStorage.getItem("ryu:domain-block-list") ?? "[]")[0].domain).toBe("spam.example");
  });

  it("deduplicates equivalent local and remote filters", () => {
    addContentFilter("Spoiler", { wholeWord: true, action: "warn" });
    mergeRemoteModerationState({
      mutes: [], blocks: [], domains: [],
      filters: [{ id: "42", filter_action: "warn", keywords: [{ keyword: " spoiler ", whole_word: true }] }]
    });
    expect(loadContentFilters()).toHaveLength(1);
  });

  it("retains remote IDs for later deletion", () => {
    mergeRemoteModerationState({
      mutes: [], blocks: [], domains: [],
      filters: [{ id: "42", filter_action: "hide", keywords: [{ keyword: "spoiler", whole_word: false }] }]
    });
    expect(loadContentFilters()[0]).toMatchObject({ id: "remote:42", phrase: "spoiler", action: "hide" });
  });
});
