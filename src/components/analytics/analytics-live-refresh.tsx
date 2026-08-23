"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowClockwise } from "@phosphor-icons/react";

import styles from "./analytics-live-refresh.module.css";

const REFRESH_INTERVAL_MS = 60_000;

function RefreshIcon({ spinning }: { spinning: boolean }) {
  return <ArrowClockwise aria-hidden="true" className={`${styles.refreshIcon} ${spinning ? styles.spinning : ""}`} size={18} />;
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
