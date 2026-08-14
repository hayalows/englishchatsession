"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./analytics-top-nav.module.css";

import Image from "next/image";

export function AnalyticsTopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || !menuOpen) return;
      event.preventDefault();
      setMenuOpen(false);
      requestAnimationFrame(() => menuTriggerRef.current?.focus());
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [menuOpen]);

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
        <nav className={styles.actions} aria-label="Analytics navigation">
          <div className={styles.moreMenu} ref={menuRef}>
            <button
              aria-controls="analytics-navigation-menu"
              aria-expanded={menuOpen}
              className={styles.menuTrigger}
              onClick={() => setMenuOpen((open) => !open)}
              ref={menuTriggerRef}
              type="button"
            >
              More
            </button>
            {menuOpen ? <div className={styles.menuPanel} id="analytics-navigation-menu" aria-label="Analytics menu">
              <a aria-label="Open English Chat Finder" href="/">Open finder</a>
              <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
            </div> : null}
          </div>
        </nav>
      </div>
    </header>
  );
}
