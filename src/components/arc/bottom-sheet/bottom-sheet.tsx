"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "@phosphor-icons/react";

import styles from "./bottom-sheet.module.css";

export function BottomSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  return (
    <dialog
      aria-describedby={description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={styles.dialog}
      onCancel={(event) => {
        event.preventDefault();
        onOpenChange(false);
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
      onClose={() => onOpenChange(false)}
      ref={dialogRef}
    >
      <div className={styles.sheet}>
        <div className={styles.handle} aria-hidden="true" />
        <header className={styles.header}>
          <div>
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={descriptionId}>{description}</p> : null}
          </div>
          <button aria-label={"Close " + title} className={styles.close} onClick={() => onOpenChange(false)} type="button">
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div className={styles.content}>{children}</div>
      </div>
    </dialog>
  );
}
