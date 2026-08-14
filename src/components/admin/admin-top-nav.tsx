"use client";

import styles from "./admin-top-nav.module.css";
import Image from "next/image";

const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

export function AdminTopNav() {
  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => undefined);
    window.location.assign("/admin/login");
  }

  return (
    <>
      <a className="skip-link" href="#admin-main">Skip to admin operations</a>
      <header className={`site-header ${styles.adminSiteHeader}`}>
        <div className={`nav-shell ${styles.navShell}`}>
          <a className="site-brand" href="/admin" aria-label="English Chat Finder administrator home">
            <Image className="brand-mark" src="/app-icon.svg" alt="" aria-hidden="true" width={40} height={40} priority />
            <span className={styles.brandCopy}>
              <strong><span className="brand-full">English Chat Finder</span><span className="brand-short">ECF</span></strong>
              <small>Administrator console</small>
            </span>
          </a>
          <nav className={`site-nav ${styles.adminNav}`} aria-label="Administrator navigation">
            <a href={PREPARE_PAGE} rel="noreferrer" target="_blank">
              Preparation guide <span aria-hidden="true">↗</span><span className="sr-only"> (opens in a new tab)</span>
            </a>
            <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
          </nav>
        </div>
      </header>
    </>
  );
}
