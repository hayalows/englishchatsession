"use client";

// Adapted from https://uselayouts.com/docs/components/filter-interaction
// Keeps its expanding filter, icon rows, and selection marks; uses analytics data and native controls.
import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Desktop, FunnelSimple, Globe, LinkSimple, Browsers } from "@phosphor-icons/react";
import type { FilterChip, FilterField } from "../arc/filter-toolbar/filter-toolbar";
import styles from "./analytics-filter-interaction.module.css";

const ICONS = { country: Globe, device: Desktop, browser: Browsers, source: LinkSimple };

export function AnalyticsFilterInteraction({ fields, selected, onSelect }: {
  fields: FilterField[];
  selected?: FilterChip;
  onSelect: (filter: FilterChip, field: FilterField) => void;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const reduced = useReducedMotion();
  const field = fields.find((item) => item.id === fieldId);
  const SelectedIcon = ICONS[selected?.id as keyof typeof ICONS] ?? Globe;

  useEffect(() => {
    if (!open) return;
    panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function outside(event: PointerEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open, fieldId]);

  return <div className={styles.root} ref={root} onKeyDown={(event) => {
    if (event.key === "Escape" && open) {
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
    }
  }} onBlur={(event) => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) setOpen(false);
  }}>
    <button className={styles.trigger} ref={trigger} type="button" aria-expanded={open} aria-controls={panelId}
      onClick={() => { setFieldId(null); setOpen((value) => !value); }}>
      {!open ? <motion.span aria-hidden="true" layoutId={panelId + "-surface"} className={styles.surface} style={{ borderRadius: 999 }} transition={{ duration: reduced ? 0 : .3 }} /> : null}
      <span className={styles.iconPair}><FunnelSimple size={19} aria-hidden="true" /><SelectedIcon size={19} aria-hidden="true" /></span>
      {selected ? "Change audience" : "Filter audience"}
    </button>
    <AnimatePresence>
      {open ? <motion.div ref={panel} id={panelId} layoutId={panelId + "-surface"} style={{ borderRadius: 16 }} className={styles.panel} role="group" aria-label="Choose an audience filter"
        initial={reduced ? false : { opacity: 0, y: -6, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .18 }}>
        <header className={styles.heading}>
          {field ? <button type="button" className={styles.back} onClick={() => setFieldId(null)} aria-label="Back to audience dimensions"><ArrowLeft size={18} /></button> : null}
          <strong>{field?.label ?? "Narrow your audience"}</strong>
        </header>
        <p className={styles.hint}>One audience dimension at a time.</p>
        <div className={styles.options}>
          {field ? field.options?.length ? field.options.map((option) => typeof option === "string" ? {value:option,label:option,hint:undefined} : option).map((option) => <button key={option.value} type="button"
            className={styles.option} aria-pressed={selected?.id === field.id && selected.value === option.value}
            onClick={() => { onSelect({ id: field.id, label: field.label, value: option.value }, field); setOpen(false); trigger.current?.focus(); }}>
            <span className={styles.optionLabel}>{option.label}</span>
            {option.hint ? <small>{option.hint} visitors</small> : null}
            <span className={styles.mark} aria-hidden="true">{selected?.id === field.id && selected.value === option.value ? <Check size={15} weight="bold" /> : null}</span>
          </button>) : <p className={styles.empty}>No {field.label.toLowerCase()} data in this period. Try a wider range.</p>
          : fields.map((item, index) => {
            const Icon = ICONS[item.id as keyof typeof ICONS] ?? Globe;
            return <motion.button key={item.id} type="button" className={styles.option}
              initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: reduced ? 0 : index * .025 }}
              onClick={() => setFieldId(item.id)}>
              <Icon size={20} aria-hidden="true" /><span className={styles.optionLabel}>{item.label}</span>
              <span className={styles.mark} aria-hidden="true">{selected?.id === item.id ? <Check size={15} weight="bold" /> : null}</span>
            </motion.button>;
          })}
        </div>
      </motion.div> : null}
    </AnimatePresence>
  </div>;
}
