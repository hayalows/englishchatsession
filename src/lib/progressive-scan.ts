export type ProgressiveScanSnapshot<T> = {
  completed: number;
  completedItems: T[];
  total: number;
};

type ProgressiveScanOptions<T, R> = {
  items: T[];
  concurrency: number;
  minimumConcurrency?: number;
  signal: AbortSignal;
  run: (item: T, signal: AbortSignal) => Promise<R>;
  isRateLimited?: (result: R) => boolean;
  isTemporaryFailure?: (result: R) => boolean;
  onProgress: (snapshot: ProgressiveScanSnapshot<T>) => void;
  onResult?: (item: T, result: R, snapshot: ProgressiveScanSnapshot<T>) => void;
  onReducedSpeed?: () => void;
};

export async function runProgressiveScan<T, R>({
  items,
  concurrency,
  minimumConcurrency = 1,
  signal,
  run,
  isRateLimited = () => false,
  isTemporaryFailure = () => false,
  onProgress,
  onResult,
  onReducedSpeed,
}: ProgressiveScanOptions<T, R>) {
  let active = 0;
  let activeLimit = concurrency;
  let completed = 0;
  let nextIndex = 0;
  let temporaryFailureStreak = 0;
  let reduced = false;
  const completedItems: T[] = [];

  const snapshot = (): ProgressiveScanSnapshot<T> => ({
    completed,
    completedItems: [...completedItems],
    total: items.length,
  });

  onProgress(snapshot());

  await new Promise<void>((resolve) => {
    const launch = () => {
      if (signal.aborted) {
        if (active === 0) resolve();
        return;
      }

      while (active < activeLimit && nextIndex < items.length) {
        const item = items[nextIndex++];
        active += 1;
        void run(item, signal)
          .then((result) => {
            if (signal.aborted) return;
            completed += 1;
            completedItems.push(item);
            const nextSnapshot = snapshot();
            onResult?.(item, result, nextSnapshot);
            onProgress(nextSnapshot);

            const rateLimited = isRateLimited(result);
            temporaryFailureStreak = rateLimited || isTemporaryFailure(result)
              ? temporaryFailureStreak + 1
              : 0;
            if (rateLimited || temporaryFailureStreak >= 3) {
              const nextLimit = Math.max(minimumConcurrency, Math.floor(activeLimit / 2));
              if (nextLimit < activeLimit) {
                activeLimit = nextLimit;
                if (!reduced) onReducedSpeed?.();
                reduced = true;
              }
            }
          })
          .catch((error) => {
            if (signal.aborted || (error instanceof Error && error.name === "AbortError")) return;
            completed += 1;
            completedItems.push(item);
            onProgress(snapshot());
          })
          .finally(() => {
            active -= 1;
            if ((signal.aborted || nextIndex >= items.length) && active === 0) resolve();
            else launch();
          });
      }

      if (nextIndex >= items.length && active === 0) resolve();
    };

    launch();
  });

  return { ...snapshot(), reduced, stopped: signal.aborted };
}

