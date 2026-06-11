import type { CSSProperties, ReactNode } from "react";

/* Shojin shared primitives — ported from the design handoff. */

type IconName =
  | "profile"
  | "plus"
  | "play"
  | "dumbbell"
  | "flame"
  | "check"
  | "chevron"
  | "bolt"
  | "edit"
  | "sun"
  | "moon"
  | "trash";

export function Icon({
  name,
  size = 22,
  color = "currentColor",
  sw = 1.9,
  style,
}: {
  name: IconName;
  size?: number;
  color?: string;
  sw?: number;
  style?: CSSProperties;
}) {
  const p = {
    fill: "none",
    stroke: color,
    strokeWidth: sw,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, ReactNode> = {
    profile: (
      <>
        <circle cx="12" cy="8.5" r="3.6" {...p} />
        <path d="M5.5 20c0-3.6 2.9-6 6.5-6s6.5 2.4 6.5 6" {...p} />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" {...p} />,
    play: <path d="M8 5.5 18 12 8 18.5z" fill={color} stroke={color} strokeWidth={sw} strokeLinejoin="round" />,
    dumbbell: (
      <>
        <path d="M3 12h18" {...p} />
        <rect x="3.2" y="8.5" width="3" height="7" rx="1" fill={color} stroke="none" />
        <rect x="17.8" y="8.5" width="3" height="7" rx="1" fill={color} stroke="none" />
        <rect x="6.6" y="6.5" width="2.6" height="11" rx="1" fill={color} stroke="none" />
        <rect x="14.8" y="6.5" width="2.6" height="11" rx="1" fill={color} stroke="none" />
      </>
    ),
    flame: (
      // Solid flame, native 24×24 grid — fill-based, so it opts out of the stroke props.
      <path
        fill={color}
        fillRule="evenodd"
        clipRule="evenodd"
        d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.176 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152-.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.313-1.172c.628.465 1.35.81 2.133 1a5.99 5.99 0 0 1 1.925-3.546 3.75 3.75 0 0 1 3.255 3.718Z"
      />
    ),
    check: <path d="M5 12.5 10 17l9-10" {...p} />,
    chevron: <path d="M9 5l7 7-7 7" {...p} />,
    bolt: <path d="M13 3 5 13.5h6L10 21l9-11h-6z" {...p} />,
    edit: <path d="M14 5l5 5M4 20l1-4L16 5l3 3L8 19z" {...p} />,
    sun: (
      <>
        <circle cx="12" cy="12" r="4" {...p} />
        <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" {...p} />
      </>
    ),
    moon: <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" {...p} />,
    trash: <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" {...p} />,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={style} aria-hidden="true">
      {paths[name]}
    </svg>
  );
}

export function Eyebrow({ children, className = "", style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={`rp-eyebrow ${className}`} style={style}>
      {children}
    </div>
  );
}

/** mono pill/badge — amber or green tinted */
export function Pill({
  tone = "green",
  children,
  className = "",
  style,
}: {
  tone?: "amber" | "green";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const tones =
    tone === "amber"
      ? "bg-amber-soft text-amber-ink"
      : "bg-green-soft text-green-ink";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold tracking-wide ${tones} ${className}`}
      style={style}
    >
      {children}
    </span>
  );
}

/** up/down trend chip — green up, muted down */
export function Delta({ value, up = true }: { value: string; up?: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
        up ? "bg-green-soft text-green-ink" : "bg-surface-2 text-ink-soft"
      }`}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" style={{ transform: up ? "none" : "rotate(180deg)" }}>
        <path d="M12 19V6M6 12l6-6 6 6" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {value}
    </span>
  );
}

export interface WeekDay {
  l: string;
  done?: boolean;
  today?: boolean;
  label: string;
}

export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <div className="flex gap-1">
      {days.map((d, i) => (
        <div key={i} className="flex flex-1 flex-col items-center gap-2">
          <div className="text-[11px] font-semibold text-ink-faint">{d.l}</div>
          <div
            className={[
              "flex h-[30px] w-[30px] items-center justify-center rounded-[11px] text-xs font-bold",
              d.done
                ? "border border-green bg-green text-on-green"
                : d.today
                  ? "border-2 border-amber bg-transparent text-ink"
                  : "border border-line bg-surface-2 text-ink-faint",
            ].join(" ")}
          >
            {d.done ? <Icon name="check" size={15} color="var(--color-on-green)" sw={2.6} /> : d.label}
          </div>
        </div>
      ))}
    </div>
  );
}
