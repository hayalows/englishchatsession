"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import styles from "./analytics-live-refresh.module.css";

const REFRESH_INTERVAL_MS = 60_000;

export function AnalyticsLiveRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "hidden") {
        startTransition(() => router.refresh());
      }
    }, REFRESH_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [router, startTransition]);

  return (
    <div className={styles.controls}>
      <span aria-live="polite">{isPending ? "Refreshing…" : "Auto-refreshes every minute"}</span>
      <button disabled={isPending} onClick={() => startTransition(() => router.refresh())} type="button">
        {isPending ? "Refreshing" : "Refresh now"}
      </button>
    </div>
  );
}
