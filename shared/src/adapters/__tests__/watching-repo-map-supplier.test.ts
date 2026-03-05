import { describe, it, expect, vi } from "vitest";
import type { RepoMapSupplier } from "#core/interfaces/repo-map-supplier.interface.js";
import type { IgnoreProvider } from "#core/interfaces/ignore-provider.interface.js";
import { AicError } from "#core/errors/aic-error.js";
import type { RepoMap } from "#core/types/repo-map.js";
import { toAbsolutePath, toRelativePath } from "#core/types/paths.js";
import { toBytes, toTokenCount } from "#core/types/units.js";
import { toISOTimestamp } from "#core/types/identifiers.js";
import { WatchingRepoMapSupplier } from "../watching-repo-map-supplier.js";

const MOCK_LAST_MODIFIED = toISOTimestamp("2020-01-01T00:00:00.000Z");

function makeMockRepoMap(root: string): RepoMap {
  const files = [
    {
      path: toRelativePath("a.ts"),
      language: "typescript",
      sizeBytes: toBytes(10),
      estimatedTokens: toTokenCount(3),
      lastModified: MOCK_LAST_MODIFIED,
    },
  ];
  return {
    root: toAbsolutePath(root),
    files,
    totalFiles: 1,
    totalTokens: toTokenCount(3),
  };
}

describe("WatchingRepoMapSupplier", () => {
  it("first_call_delegates_and_returns", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const watchFn = vi.fn().mockReturnValue({ close: vi.fn(), on: vi.fn() });
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn);
    const result = await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(result).toBe(mockRepoMap);
    expect(inner.getRepoMap).toHaveBeenCalledTimes(1);
    expect(inner.getRepoMap).toHaveBeenCalledWith(toAbsolutePath(projectRoot));
    expect(watchFn).toHaveBeenCalledTimes(1);
    expect(watchFn).toHaveBeenCalledWith(
      projectRoot,
      { recursive: true },
      expect.any(Function),
    );
    supplier.close();
  });

  it("second_call_same_root_returns_cached", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const watchFn = vi.fn().mockReturnValue({ close: vi.fn(), on: vi.fn() });
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn);
    const first = await supplier.getRepoMap(toAbsolutePath(projectRoot));
    const second = await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(1);
    expect(first).toBe(second);
    expect(first).toBe(mockRepoMap);
    supplier.close();
  });

  it("watcher_event_updates_entry", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    let watchListener: (eventType: string, filename: string | null) => void = () => {};
    const mockWatcher = { close: vi.fn(), on: vi.fn() };
    const watchFn = vi
      .fn()
      .mockImplementation(
        (
          _path: string,
          _opts: unknown,
          listener: (eventType: string, filename: string | null) => void,
        ) => {
          watchListener = listener;
          return mockWatcher;
        },
      );
    const statFn = vi.fn().mockReturnValue({
      isFile: () => true,
      size: 42,
      mtime: { toISOString: () => "2025-01-01T00:00:00.000Z" },
    });
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn, statFn);
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    watchListener("change", "new-file.ts");
    const cached = await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(1);
    const newEntry = cached.files.find((f) => f.path === toRelativePath("new-file.ts"));
    expect(newEntry).toBeDefined();
    if (newEntry) expect(newEntry.sizeBytes).toBe(toBytes(42));
    supplier.close();
  });

  it("watcher_filename_undefined_invalidates_cache", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    let watchListener: (eventType: string, filename: string | null) => void = () => {};
    const watchFn = vi
      .fn()
      .mockImplementation(
        (
          _path: string,
          _opts: unknown,
          listener: (eventType: string, filename: string | null) => void,
        ) => {
          watchListener = listener;
          return { close: vi.fn(), on: vi.fn() };
        },
      );
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn);
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    watchListener("change", null);
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(2);
    supplier.close();
  });

  it("watch_throws_graceful_fallback", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const watchFn = vi.fn().mockImplementation(() => {
      throw new AicError("EMFILE", "WATCH_FAILED");
    });
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn);
    const result = await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(result).toBe(mockRepoMap);
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(2);
    supplier.close();
  });

  it("watcher_error_event_invalidates_cache", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    let errorHandler: (err: Error) => void = () => {};
    const mockWatcher = {
      close: vi.fn(),
      on: vi.fn().mockImplementation((event: string, handler: (err: Error) => void) => {
        if (event === "error") errorHandler = handler;
      }),
    };
    const watchFn = vi.fn().mockReturnValue(mockWatcher);
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn);
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(1);
    errorHandler(new Error("watch failure"));
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(2);
    expect(watchFn).toHaveBeenCalledTimes(2);
    supplier.close();
  });

  it("close_stops_all_watchers", async () => {
    const projectRoot = "/tmp/proj";
    const mockRepoMap = makeMockRepoMap(projectRoot);
    const inner: RepoMapSupplier = {
      getRepoMap: vi.fn().mockResolvedValue(mockRepoMap),
    };
    const mockIgnore: IgnoreProvider = { accepts: () => true };
    const mockWatcher = { close: vi.fn(), on: vi.fn() };
    const watchFn = vi.fn().mockReturnValue(mockWatcher);
    const supplier = new WatchingRepoMapSupplier(inner, mockIgnore, watchFn);
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    supplier.close();
    expect(mockWatcher.close).toHaveBeenCalled();
    await supplier.getRepoMap(toAbsolutePath(projectRoot));
    expect(inner.getRepoMap).toHaveBeenCalledTimes(2);
    supplier.close();
  });
});
