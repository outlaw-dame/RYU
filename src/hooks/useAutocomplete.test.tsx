import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/search/autocomplete", () => ({
  autocomplete: vi.fn()
}));

import { autocomplete } from "@/search/autocomplete";
import { useAutocomplete } from "./useAutocomplete";

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {};
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe("useAutocomplete", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  it("returns [] and skips queries shorter than 2 characters", () => {
    const mockedAutocomplete = vi.mocked(autocomplete);
    const { result, rerender } = renderHook(({ query }) => useAutocomplete(query), {
      initialProps: { query: "d" }
    });

    expect(result.current).toEqual([]);

    act(() => {
      vi.runAllTimers();
    });

    expect(mockedAutocomplete).not.toHaveBeenCalled();

    rerender({ query: " " });
    expect(result.current).toEqual([]);
    expect(mockedAutocomplete).not.toHaveBeenCalled();
  });

  it("ignores stale async results when query changes", async () => {
    const mockedAutocomplete = vi.mocked(autocomplete);
    const first = createDeferred<Array<{ id: string; title: string }>>();

    mockedAutocomplete
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValueOnce([{ id: "2", title: "Dune Messiah" }]);

    const { result, rerender } = renderHook(({ query }) => useAutocomplete(query), {
      initialProps: { query: "du" }
    });

    act(() => {
      vi.advanceTimersByTime(151);
    });

    rerender({ query: "dun" });

    act(() => {
      vi.advanceTimersByTime(151);
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toEqual([{ id: "2", title: "Dune Messiah" }]);

    await act(async () => {
      first.resolve([{ id: "1", title: "Dune" }]);
      await Promise.resolve();
    });

    expect(result.current).toEqual([{ id: "2", title: "Dune Messiah" }]);
    expect(mockedAutocomplete).toHaveBeenCalledTimes(2);
  });
});
