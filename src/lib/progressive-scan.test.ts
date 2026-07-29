import { describe, expect, it } from "vitest";

import { runProgressiveScan } from "./progressive-scan";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, reject, resolve };
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe("progressive scan queue", () => {
  it("begins every search at zero and increases after each completed request", async () => {
    for (let runNumber = 0; runNumber < 3; runNumber += 1) {
      const progress: number[] = [];
      await runProgressiveScan({
        items: ["a", "b"],
        concurrency: 1,
        signal: new AbortController().signal,
        run: async (item) => item,
        onProgress: (snapshot) => progress.push(snapshot.completed),
      });
      expect(progress).toEqual([0, 1, 2]);
    }
  });

  it("publishes the first opening before the full scan ends and keeps scanning", async () => {
    const tasks = {
      a: deferred<"available">(),
      b: deferred<"none">(),
      c: deferred<"none">(),
    };
    const started: string[] = [];
    const results: string[] = [];
    let finished = false;
    const scan = runProgressiveScan({
      items: ["a", "b", "c"],
      concurrency: 2,
      signal: new AbortController().signal,
      run: async (item) => {
        started.push(item);
        return tasks[item as keyof typeof tasks].promise;
      },
      onProgress: () => undefined,
      onResult: (item, result) => results.push(`${item}:${result}`),
    }).then(() => {
      finished = true;
    });

    expect(started).toEqual(["a", "b"]);
    tasks.a.resolve("available");
    await settle();

    expect(results).toContain("a:available");
    expect(started).toEqual(["a", "b", "c"]);
    expect(finished).toBe(false);

    tasks.b.resolve("none");
    tasks.c.resolve("none");
    await scan;
    expect(finished).toBe(true);
  });

  it("stopping preserves completed results and does not count aborted work", async () => {
    const controller = new AbortController();
    const tasks = {
      a: deferred<"available">(),
      b: deferred<"none">(),
    };
    const results: string[] = [];
    const scan = runProgressiveScan({
      items: ["a", "b"],
      concurrency: 1,
      signal: controller.signal,
      run: (item, signal) => {
        const task = tasks[item as keyof typeof tasks];
        signal.addEventListener("abort", () => task.reject(new DOMException("Stopped", "AbortError")), { once: true });
        return task.promise;
      },
      onProgress: () => undefined,
      onResult: (item) => results.push(item),
    });

    tasks.a.resolve("available");
    await settle();
    controller.abort();
    const summary = await scan;

    expect(results).toEqual(["a"]);
    expect(summary.completed).toBe(1);
    expect(summary.completedItems).toEqual(["a"]);
    expect(summary.stopped).toBe(true);
  });
});

