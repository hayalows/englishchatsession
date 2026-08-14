"use client";

import styles from "./analytics-top-nav.module.css";

import { AnalyticsLiveRefresh } from "@/components/analytics/analytics-live-refresh";
import Image from "next/image";

export function AnalyticsTopNav({ activeNowVisitors = 0 }: { activeNowVisitors?: number }) {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/analytics/login");
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a className={styles.brand} href="/" aria-label="Open English Chat Finder">
          <Image className={styles.mark} src="/app-icon.svg" alt="" aria-hidden="true" width={40} height={40} priority />
          <span className={styles.copy}>
            <strong className={styles.fullName}>English Chat Finder</strong>
            <strong className={styles.shortName}>ECF</strong>
            <small>Private visitor analytics</small>
          </span>
        </a>
        <span className={styles.online} aria-live="polite"><i aria-hidden="true" />{activeNowVisitors.toLocaleString()} active now</span>
        <nav className={styles.actions} aria-label="Analytics navigation">
          <AnalyticsLiveRefresh compact />
          <div className={styles.desktopLinks}>
            <a aria-label="Open English Chat Finder" href="/">Finder</a>
            <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
          </div>
          <details className={styles.moreMenu}>
            <summary>More</summary>
            <div className={styles.menuPanel}>
              <a aria-label="Open English Chat Finder" href="/">Open finder</a>
              <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
            </div>
          </details>
        </nav>
      </div>
    </header>
  );
}
