"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";

const AVAILABILITY_PAGE_SIZE = 5;
const ISSUE_PAGE_SIZE = 8;

type TargetConfig = {
  selector: string;
  pageSize: number;
  singular: string;
  plural: string;
};

const TARGETS: TargetConfig[] = [
  {
    selector: 'section[aria-labelledby="availability-title"]',
    pageSize: AVAILABILITY_PAGE_SIZE,
    singular: "opening",
    plural: "openings",
  },
  {
    selector: 'section[aria-labelledby="issues-title"]',
    pageSize: ISSUE_PAGE_SIZE,
    singular: "issue",
    plural: "issues",
  },
];

function ProgressiveControl({ config }: { config: TargetConfig }) {
  const [section, setSection] = useState<HTMLElement | null>(null);
  const [visibleCount, setVisibleCount] = useState(config.pageSize);
  const [itemCount, setItemCount] = useState(0);
  const [mount, setMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    let currentSection: HTMLElement | null = null;
    let currentMount: HTMLElement | null = null;

    const sync = () => {
      const nextSection = document.querySelector<HTMLElement>(config.selector);
      if (nextSection !== currentSection) {
        currentMount?.remove();
        currentSection = nextSection;
        setSection(nextSection);
        setVisibleCount(config.pageSize);

        if (nextSection) {
          currentMount = document.createElement("div");
          currentMount.className = "admin-progressive-list-control";
          nextSection.appendChild(currentMount);
          setMount(currentMount);
        } else {
          currentMount = null;
          setMount(null);
        }
      }

      const cards = currentSection ? Array.from(currentSection.querySelectorAll<HTMLElement>("article")) : [];
      setItemCount(cards.length);
      cards.forEach((card, index) => {
        const hidden = index >= visibleCount;
        card.hidden = hidden;
        card.setAttribute("aria-hidden", hidden ? "true" : "false");
      });
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      currentMount?.remove();
      if (currentSection) {
        currentSection.querySelectorAll<HTMLElement>("article").forEach((card) => {
          card.hidden = false;
          card.removeAttribute("aria-hidden");
        });
      }
    };
  }, [config, visibleCount]);

  useEffect(() => {
    setVisibleCount(config.pageSize);
  }, [config.pageSize, section]);

  const remaining = Math.max(0, itemCount - visibleCount);
  const copy = useMemo(() => {
    const visible = Math.min(itemCount, visibleCount);
    const noun = itemCount === 1 ? config.singular : config.plural;
    return `${visible} of ${itemCount} ${noun} shown`;
  }, [config.plural, config.singular, itemCount, visibleCount]);

  if (!mount || itemCount <= config.pageSize) return null;

  return createPortal(
    <div className="admin-progressive-list-row" aria-live="polite">
      <span>{copy}</span>
      {remaining > 0 ? (
        <button onClick={() => setVisibleCount((count) => Math.min(itemCount, count + config.pageSize))} type="button">
          Show {Math.min(config.pageSize, remaining)} more
        </button>
      ) : (
        <button onClick={() => setVisibleCount(config.pageSize)} type="button">Show fewer</button>
      )}
    </div>,
    mount,
  );
}

export function AdminProgressiveLists() {
  return <>{TARGETS.map((config) => <ProgressiveControl config={config} key={config.selector} />)}</>;
}
