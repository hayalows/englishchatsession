export type StoredScanReport = {
  state: "running" | "complete" | "stopped";
  speed: "fast" | "reduced";
  completed: number;
  completedUrls: string[];
  total: number;
  urls: string[];
  startedAt: string;
  finishedAt?: string;
  scope: string;
  waitingCount?: number;
};

export function normalizeStoredScan(value: unknown, savedAt: string): StoredScanReport | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<StoredScanReport>;
  if (
    !["running", "complete", "stopped"].includes(candidate.state ?? "")
    || !["fast", "reduced"].includes(candidate.speed ?? "")
    || typeof candidate.completed !== "number"
    || typeof candidate.total !== "number"
    || !Array.isArray(candidate.completedUrls)
    || !candidate.completedUrls.every((url) => typeof url === "string")
    || !Array.isArray(candidate.urls)
    || !candidate.urls.every((url) => typeof url === "string")
    || typeof candidate.startedAt !== "string"
    || typeof candidate.scope !== "string"
  ) {
    return null;
  }
  return {
    state: (candidate.state === "running" ? "stopped" : candidate.state) as StoredScanReport["state"],
    speed: candidate.speed as StoredScanReport["speed"],
    completed: Math.max(0, candidate.completed),
    completedUrls: [...new Set(candidate.completedUrls)],
    total: Math.max(0, candidate.total),
    urls: [...new Set(candidate.urls)],
    startedAt: candidate.startedAt,
    finishedAt: candidate.finishedAt ?? savedAt,
    scope: candidate.scope,
    waitingCount: typeof candidate.waitingCount === "number" ? Math.max(0, candidate.waitingCount) : undefined,
  };
}

