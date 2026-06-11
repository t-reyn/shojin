"use client";

import { useRef, type ReactNode } from "react";
import { Icon } from "./ShojinUI";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
  /** optional distinct icon shown when the tab is active */
  iconActive?: ReactNode;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
  onFab: () => void;
  /** true while a workout draft is in progress — FAB reads "continue" */
  fabActive?: boolean;
  /** true when the in-progress draft is editing a saved workout — FAB reads "Continue editing" */
  fabEditing?: boolean;
}

/**
 * Shojin bottom bar: four tabs split around a raised amber + FAB.
 * Layout: [tab tab] (FAB) [tab tab]. The FAB is a sibling of the
 * `role="tablist"` so assistive tech enumerates exactly four tabs.
 */
export function TabBar<T extends string>({ tabs, active, onChange, onFab, fabActive, fabEditing }: Props<T>) {
  const listRef = useRef<HTMLDivElement>(null);

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const idx = tabs.findIndex((t) => t.id === active);
    let next = idx;
    if (e.key === "ArrowRight") next = (idx + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    listRef.current
      ?.querySelectorAll<HTMLButtonElement>("button[role='tab']")
      ?.[next]?.focus();
  }

  const renderTab = (t: TabDef<T>) => {
    const isActive = t.id === active;
    return (
      <button
        key={t.id}
        role="tab"
        aria-selected={isActive}
        tabIndex={isActive ? 0 : -1}
        onClick={() => onChange(t.id)}
        className={[
          "flex flex-1 flex-col items-center gap-1 rounded-lg py-1 text-[10px] font-semibold transition-colors",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-green-ink",
          isActive ? "text-green-ink" : "text-ink-faint hover:text-ink-soft",
        ].join(" ")}
      >
        <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
          {isActive && t.iconActive ? t.iconActive : t.icon}
        </span>
        {t.label}
      </button>
    );
  };

  return (
    <div className="relative flex w-full items-start">
      <div
        ref={listRef}
        role="tablist"
        aria-label="Sections"
        onKeyDown={handleKeyDown}
        className="flex w-full items-start justify-around gap-1"
      >
        {tabs.slice(0, 2).map(renderTab)}

        <div className="flex-1" aria-hidden="true" />

        {tabs.slice(2).map(renderTab)}
      </div>

      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <button
          onClick={onFab}
          aria-label={fabEditing ? "Continue editing" : fabActive ? "Continue workout" : "Start workout"}
          className="pointer-events-auto -mt-1.5 flex h-[52px] w-[52px] items-center justify-center rounded-[18px] bg-amber text-on-amber shadow-[0_6px_16px_rgba(255,159,41,0.45)] transition-transform active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-green-ink"
        >
          <Icon name={fabActive ? "play" : "plus"} size={fabActive ? 22 : 26} color="var(--color-on-amber)" sw={2.4} />
        </button>
      </div>
    </div>
  );
}
