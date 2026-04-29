import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db/client", () => ({
  getDatabase: vi.fn()
}));

import { getDatabase } from "@/db/client";
import { autocomplete } from "./autocomplete";

describe("autocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns [] for short or empty queries", async () => {
    const mockedGetDatabase = vi.mocked(getDatabase);

    await expect(autocomplete(" ")).resolves.toEqual([]);
    await expect(autocomplete("a")).resolves.toEqual([]);

    expect(mockedGetDatabase).not.toHaveBeenCalled();
  });

  it("escapes regex metacharacters before querying", async () => {
    const find = vi.fn().mockReturnValue({
      exec: vi.fn().mockResolvedValue([])
    });

    vi.mocked(getDatabase).mockResolvedValue({
      editions: { find }
    } as unknown as Awaited<ReturnType<typeof getDatabase>>);

    await autocomplete("a+b");

    expect(find).toHaveBeenCalledWith({
      selector: { title: { $regex: "^a\\+b", $options: "i" } },
      limit: 8
    });
  });

  it("maps matched docs to JSON payloads", async () => {
    const exec = vi.fn().mockResolvedValue([
      { toJSON: () => ({ id: "1", title: "Dune" }) },
      { toJSON: () => ({ id: "2", title: "Dune Messiah" }) }
    ]);

    vi.mocked(getDatabase).mockResolvedValue({
      editions: {
        find: vi.fn().mockReturnValue({ exec })
      }
    } as unknown as Awaited<ReturnType<typeof getDatabase>>);

    const result = await autocomplete("du");
    expect(result).toEqual([
      { id: "1", title: "Dune" },
      { id: "2", title: "Dune Messiah" }
    ]);
  });
});
