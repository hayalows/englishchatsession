"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import Image from "next/image";

import styles from "@/app/admin/login/login.module.css";

type AdminLoginFormProps = {
  destination: string;
  contextLabel: string;
  eyebrow: string;
  heading: string;
  lead: string;
  expectations: string[];
  formTitle: string;
  formIntro: string;
  submitLabel: string;
};

export function AdminLoginForm({
  destination,
  contextLabel,
  eyebrow,
  heading,
  lead,
  expectations,
  formTitle,
  formIntro,
  submitLabel,
}: AdminLoginFormProps) {
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const payload = await response.json() as { message?: unknown };
      if (!response.ok) {
        setMessage(typeof payload.message === "string" ? payload.message : "Unable to sign in.");
        return;
      }
      window.location.assign(destination);
    } catch {
      setMessage("Unable to reach the administrator sign-in service.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className={styles.loginShell}>
      <section className={styles.loginCard} aria-labelledby="login-title">
        <div className={styles.contextPanel}>
          <div className={styles.brandRow}>
            <Image className={styles.brandMark} src="/app-icon.svg" alt="" aria-hidden="true" width={46} height={46} priority />
            <span className={styles.brandCopy}>
              <strong>English Chat Finder</strong>
              <span>{contextLabel}</span>
            </span>
          </div>

          <div>
            <p className={styles.eyebrow}>{eyebrow}</p>
            <h1 id="login-title">{heading}</h1>
            <p className={styles.lead}>{lead}</p>
          </div>

          <div className={styles.expectationCard} aria-label="What you can do after signing in">
            <strong>After you sign in</strong>
            <ul className={styles.expectationList}>
              {expectations.map((expectation, index) => (
                <li key={expectation}><span className={styles.expectationIcon} aria-hidden="true">{index + 1}</span><span>{expectation}</span></li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.formPanel}>
          <div>
            <h2>{formTitle}</h2>
            <p className={styles.formIntro}>{formIntro}</p>
          </div>

          <form className={styles.loginForm} onSubmit={submit}>
            <div className={styles.fieldLabel}>
              <label htmlFor="admin-password">Administrator password</label>
              <span className={styles.fieldHelp} id="admin-password-help">Enter the password provided for administrator access.</span>
              <div className={styles.passwordField}>
                <input
                  aria-describedby="admin-password-help"
                  autoComplete="current-password"
                  id="admin-password"
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type={passwordVisible ? "text" : "password"}
                  value={password}
                />
                <button
                  aria-label={passwordVisible ? "Hide administrator password" : "Show administrator password"}
                  className={styles.visibilityButton}
                  onClick={() => setPasswordVisible((visible) => !visible)}
                  type="button"
                >
                  {passwordVisible ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {message ? <p className={styles.loginError} role="alert">{message}</p> : null}

            <button className={styles.submitButton} disabled={submitting || !password} type="submit">
              {submitting ? <span className={styles.spinner} aria-hidden="true" /> : null}
              {submitting ? "Signing in" : submitLabel}
            </button>
          </form>

          <p className={styles.securityNote}>
            <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8">
              <rect x="5" y="10" width="14" height="10" rx="2" />
              <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
            <span>Your password is checked on the server and is not stored in this browser.</span>
          </p>

          <div className={styles.studentRoute}>
            <span>Looking for an English Chat session?</span>
            <a href="/">Open Student finder <span aria-hidden="true">→</span></a>
          </div>
        </div>
      </section>
    </main>
  );
}
