"use client";

import { useEffect, useRef, useState } from "react";

import styles from "./admin-top-nav.module.css";
import Image from "next/image";

const PREPARE_PAGE = "https://sites.google.com/view/english-chat-student-center/English-Chat-Structure?authuser=0";

export function AdminTopNav() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) setMenuOpen(false);
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
            <div className={styles.moreMenu} ref={menuRef}>
              <button
                aria-controls="admin-navigation-menu"
                aria-expanded={menuOpen}
                className={styles.menuTrigger}
                onClick={() => setMenuOpen((open) => !open)}
                ref={menuTriggerRef}
                type="button"
              >
                More
              </button>
              {menuOpen ? (
                <div className={styles.menuPanel} id="admin-navigation-menu" aria-label="Administrator menu">
                  <a href={PREPARE_PAGE} onClick={() => setMenuOpen(false)} rel="noreferrer" target="_blank">
                    Preparation guide<span className="sr-only"> (opens in a new tab)</span>
                  </a>
                  <button className={styles.logoutButton} onClick={() => void logout()} type="button">Sign out</button>
                </div>
              ) : null}
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
