"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

import styles from "./analytics-live-refresh.module.css";

const REFRESH_INTERVAL_MS = 60_000;

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return (
    <svg aria-hidden="true" className={`${styles.refreshIcon} ${spinning ? styles.spinning : ""}`} fill="none" viewBox="0 0 24 24">
      <path d="M20 11a8 8 0 0 0-14.9-4L3 9" />
      <path d="M3 4v5h5" />
      <path d="M4 13a8 8 0 0 0 14.9 4L21 15" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

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
      <span aria-live="polite" className={styles.srOnly}>
        {isPending ? "Refreshing analytics" : "Analytics refreshes automatically every minute"}
      </span>
      <button
        aria-busy={isPending}
        aria-label={isPending ? "Refreshing analytics" : "Refresh analytics"}
        disabled={isPending}
        onClick={() => startTransition(() => router.refresh())}
        title={isPending ? "Refreshing analytics" : "Refresh analytics"}
        type="button"
      >
        <RefreshIcon spinning={isPending} />
      </button>
    </div>
  );
}
