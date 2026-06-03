"use client";

import { useRef, type ReactNode } from "react";

export interface TabDef<T extends string> {
  id: T;
  label: string;
  icon: ReactNode;
}

interface Props<T extends string> {
  tabs: TabDef<T>[];
  active: T;
  onChange: (id: T) => void;
}

export function TabBar<T extends string>({ tabs, active, onChange }: Props<T>) {
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

  return (
    <div
      ref={listRef}
      role="tablist"
      aria-label="Sections"
      onKeyDown={handleKeyDown}
      className="flex w-full items-stretch gap-1"
    >
      {tabs.map((t) => {
        const isActive = t.id === active;
        return (
          <button
            key={t.id}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(t.id)}
            className={[
              "flex flex-1 flex-col items-center gap-1 rounded-lg px-2 py-2 text-[11px] font-medium transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-ember",
              isActive ? "text-ember" : "text-ink-faint hover:text-ink-soft",
            ].join(" ")}
          >
            <span aria-hidden="true" className="flex h-6 w-6 items-center justify-center">
              {t.icon}
            </span>
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
