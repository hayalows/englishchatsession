"use client";

import styles from "./analytics-top-nav.module.css";

import { AnalyticsLiveRefresh } from "@/components/analytics/analytics-live-refresh";

export function AnalyticsTopNav() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/analytics/login");
  }

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <a className={styles.brand} href="/" aria-label="Open English Chat Finder">
          <span className={styles.mark} aria-hidden="true">EC</span>
          <span className={styles.copy}>
            <strong>English Chat Finder</strong>
            <small>Private visitor analytics</small>
          </span>
        </a>
        <nav className={styles.actions} aria-label="Analytics navigation">
          <AnalyticsLiveRefresh compact />
          <a aria-label="Open English Chat Finder" href="/">Finder</a>
          <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
        </nav>
      </div>
    </header>
  );
}
