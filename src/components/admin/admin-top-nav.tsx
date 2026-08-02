"use client";

import styles from "./admin-top-nav.module.css";

const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

export function AdminTopNav() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin/login");
  }

  return (
    <>
      <a className="skip-link" href="#admin-main">Skip to admin operations</a>
      <header className="site-header">
        <div className="nav-shell">
          <a className="site-brand" href="/admin" aria-label="English Chat Finder administrator home">
            <span className="brand-mark" aria-hidden="true">EC</span>
            <span className={styles.brandCopy}>
              <strong>English Chat Finder</strong>
              <small>Administrator console</small>
            </span>
          </a>
          <nav className="site-nav" aria-label="Administrator navigation">
            <a href={PREPARE_PAGE} rel="noreferrer" target="_blank">
              Prepare <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
            </a>
            <a className="nav-primary" href="/">Student finder</a>
            <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
          </nav>
        </div>
      </header>
    </>
  );
}
