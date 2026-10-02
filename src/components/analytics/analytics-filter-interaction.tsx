"use client";

// Audience rows and selection marks adapted from useLayouts Filter Interaction.
// Radix anchors the desktop popover; mobile renders the same choices inside its sheet.
import { useEffect, useRef, useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, Check, Desktop, FunnelSimple, Globe, LinkSimple, Browsers, CaretDown, CaretRight } from "@phosphor-icons/react";
import type { FilterChip, FilterField } from "../arc/filter-toolbar/filter-toolbar";
import styles from "./analytics-filter-interaction.module.css";

const ICONS = { country: Globe, device: Desktop, browser: Browsers, source: LinkSimple };

export function AnalyticsFilterInteraction({ fields, selected, onSelect, onClear, inline = false }: {
  fields: FilterField[];
  selected?: FilterChip;
  onSelect: (filter: FilterChip, field: FilterField) => void;
  onClear: () => void;
  inline?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [fieldId, setFieldId] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const field = fields.find(item => item.id === fieldId);
  const selectedOption = fields.find(item => item.id === selected?.id)?.options.find(option => typeof option !== "string" && option.value === selected?.value);
  const audienceLabel = selected ? selected.label + ": " + (typeof selectedOption === "object" ? selectedOption.label ?? selected.value : selected.value) : "All traffic";
  const SelectedIcon = ICONS[selected?.id as keyof typeof ICONS] ?? FunnelSimple;

  useEffect(() => {
    if (!open && !inline) return;
    // Changing dimension replaces the focused row; move focus to its new heading action.
    if (fieldId !== null) panel.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [open, inline, fieldId]);

  function close() {
    setOpen(false);
    setFieldId(null);
  }

  const choices = <>
    <header className={styles.heading}>
      {field ? <button type="button" className={styles.back} onClick={() => {
        setFieldId(null);
        requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`[data-dimension="${field.id}"]`)?.focus());
      }} aria-label="Back to audience dimensions"><ArrowLeft size={18} aria-hidden="true" /></button> : null}
      <strong>{field?.label ?? "Choose an audience"}</strong>
    </header>
    <p className={styles.hint}>{field ? "Choose one option for this report." : "Filter by one dimension, or view all traffic."}</p>
    <div className={styles.options}>
      {field ? field.options?.length ? field.options.map(option => typeof option === "string" ? { value: option, label: option, hint: undefined } : option).map(option => <button key={option.value} type="button"
        className={styles.option} aria-pressed={selected?.id === field.id && selected.value === option.value}
        onClick={() => { onSelect({ id: field.id, label: field.label, value: option.value }, field); close(); }}>
        <span className={styles.optionLabel}>{option.label}</span>
        {option.hint ? <small>{option.hint} visitors</small> : null}
        <span className={styles.mark} aria-hidden="true">{selected?.id === field.id && selected.value === option.value ? <Check size={15} weight="bold" /> : null}</span>
      </button>) : <p className={styles.empty}>No {field.label.toLowerCase()} data in this period. Try a wider range.</p>
      : <>
        <button type="button" className={styles.option} aria-pressed={!selected} onClick={() => { onClear(); close(); }}>
          <Globe size={20} aria-hidden="true" /><span className={styles.optionLabel}>All traffic</span>
          <span className={styles.mark} aria-hidden="true">{!selected ? <Check size={15} weight="bold" /> : null}</span>
        </button>
        {fields.map(item => {
          const Icon = ICONS[item.id as keyof typeof ICONS] ?? Globe;
          return <button key={item.id} type="button" className={styles.option} data-dimension={item.id}
            onClick={() => setFieldId(item.id)}>
            <Icon size={20} aria-hidden="true" /><span className={styles.optionLabel}>{item.label}</span>
            {selected?.id === item.id ? <Check size={15} aria-hidden="true" /> : null}
            <CaretRight size={15} aria-hidden="true" />
          </button>;
        })}
      </>}
    </div>
    {field && selected ? <button type="button" className={styles.reset} onClick={() => { onClear(); close(); }}>Reset to all traffic</button> : null}
  </>;

  if (inline) return <div ref={panel} className={styles.inlinePanel} role="group" aria-label="Choose an audience filter"
    data-sheet-escape-priority={field ? "true" : undefined}
    onKeyDown={event => {
      if (event.key === "Escape" && field) {
        event.preventDefault(); event.stopPropagation(); setFieldId(null);
        requestAnimationFrame(() => panel.current?.querySelector<HTMLButtonElement>(`[data-dimension="${field.id}"]`)?.focus());
      }
    }}>{choices}</div>;

  return <Popover.Root open={open} onOpenChange={next => { setOpen(next); if (next) setFieldId(null); }}>
    <Popover.Trigger asChild>
      <button ref={trigger} type="button" className={styles.trigger}>
        <SelectedIcon size={18} aria-hidden="true" /><span className={styles.triggerLabel}>{audienceLabel}</span><CaretDown size={14} aria-hidden="true" />
      </button>
    </Popover.Trigger>
    <AnimatePresence>
      {open ? <Popover.Portal forceMount>
        <Popover.Content asChild forceMount align="end" sideOffset={8} collisionPadding={16}
          onOpenAutoFocus={event => { event.preventDefault(); panel.current?.querySelector<HTMLButtonElement>("button")?.focus(); }}>
          <motion.div ref={panel} className={styles.panel} aria-label="Choose an audience filter"
            initial={reduced ? false : { opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduced ? 0 : .14 }}>
            {choices}
          </motion.div>
        </Popover.Content>
      </Popover.Portal> : null}
    </AnimatePresence>
  </Popover.Root>;
}
