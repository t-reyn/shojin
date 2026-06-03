import type { ReactNode } from "react";

const base = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const DashboardIcon = (): ReactNode => (
  <svg {...base}>
    <rect x="3" y="3" width="7" height="9" rx="1.5" />
    <rect x="14" y="3" width="7" height="5" rx="1.5" />
    <rect x="14" y="12" width="7" height="9" rx="1.5" />
    <rect x="3" y="16" width="7" height="5" rx="1.5" />
  </svg>
);

export const LogIcon = (): ReactNode => (
  <svg {...base}>
    <rect x="5" y="3" width="14" height="18" rx="2" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </svg>
);

export const ProgressIcon = (): ReactNode => (
  <svg {...base}>
    <path d="M4 19V5M4 19h16" />
    <path d="M7 15l4-4 3 3 4-6" />
  </svg>
);

export const ToolsIcon = (): ReactNode => (
  <svg {...base}>
    <path d="M4 7h10M18 7h2" />
    <circle cx="16" cy="7" r="2" />
    <path d="M4 17h6M14 17h6" />
    <circle cx="12" cy="17" r="2" />
  </svg>
);
