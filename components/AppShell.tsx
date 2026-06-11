"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { TabBar, type TabDef } from "./TabBar";
import { Dashboard } from "./Dashboard";
import { WorkoutLogger } from "./WorkoutLogger";
import { History } from "./History";
import { Progress } from "./Progress";
import { Tools } from "./Tools";
import { RestTimer } from "./RestTimer";
import { StartModal } from "./StartModal";
import { Toaster } from "./Toaster";
import { DialogHost } from "./DialogHost";
import { UpdateBanner } from "./UpdateBanner";
import { InstallPrompt } from "./InstallPrompt";

type TabId = "home" | "history" | "progress" | "profile";

const Outline = ({ d }: { d: string }) => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d={d} />
  </svg>
);
const Solid = ({ children }: { children: React.ReactNode }) => (
  <svg width={24} height={24} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    {children}
  </svg>
);

const TABS: TabDef<TabId>[] = [
  {
    id: "home",
    label: "Home",
    icon: <Outline d="m2.25 12 8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />,
    iconActive: (
      <Solid>
        <path d="M11.47 3.841a.75.75 0 0 1 1.06 0l8.69 8.69a.75.75 0 1 0 1.06-1.061l-8.689-8.69a2.25 2.25 0 0 0-3.182 0l-8.69 8.69a.75.75 0 1 0 1.061 1.06l8.69-8.689Z" />
        <path d="m12 5.432 8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 0 1-.75-.75v-4.5a.75.75 0 0 0-.75-.75h-3a.75.75 0 0 0-.75.75V21a.75.75 0 0 1-.75.75H5.625a1.875 1.875 0 0 1-1.875-1.875v-6.198a2.29 2.29 0 0 0 .091-.086L12 5.432Z" />
      </Solid>
    ),
  },
  {
    id: "history",
    label: "History",
    icon: <Outline d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />,
    iconActive: (
      <Solid>
        <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25ZM12.75 6a.75.75 0 0 0-1.5 0v6c0 .414.336.75.75.75h4.5a.75.75 0 0 0 0-1.5h-3.75V6Z" clipRule="evenodd" />
      </Solid>
    ),
  },
  {
    id: "progress",
    label: "Progress",
    icon: <Outline d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />,
    iconActive: (
      <Solid>
        <path d="M18.375 2.25c-1.035 0-1.875.84-1.875 1.875v15.75c0 1.035.84 1.875 1.875 1.875h.75c1.035 0 1.875-.84 1.875-1.875V4.125c0-1.036-.84-1.875-1.875-1.875h-.75ZM9.75 8.625c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v11.25c0 1.035-.84 1.875-1.875 1.875h-.75a1.875 1.875 0 0 1-1.875-1.875V8.625ZM3 13.125c0-1.036.84-1.875 1.875-1.875h.75c1.036 0 1.875.84 1.875 1.875v6.75c0 1.035-.84 1.875-1.875 1.875h-.75A1.875 1.875 0 0 1 3 19.875v-6.75Z" />
      </Solid>
    ),
  },
  {
    id: "profile",
    label: "Profile",
    icon: <Outline d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />,
    iconActive: (
      <Solid>
        <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z" clipRule="evenodd" />
      </Solid>
    ),
  },
];

export function AppShell({ userEmail }: { userEmail: string }) {
  const [active, setActive] = useState<TabId>("home");
  const loaded = useStore((s) => s.loaded);
  const hydrate = useStore((s) => s.hydrate);
  const draft = useStore((s) => s.draft);
  const [error, setError] = useState("");
  const [retrying, setRetrying] = useState(false);
  const [showStart, setShowStart] = useState(false);
  const [showLogger, setShowLogger] = useState(false);

  useEffect(() => {
    hydrate().catch((e) => setError(e.message ?? String(e)));
  }, [hydrate]);

  function retryHydrate() {
    setRetrying(true);
    setError("");
    hydrate()
      .catch((e) => setError(e.message ?? String(e)))
      .finally(() => setRetrying(false));
  }

  function openLogger() {
    setShowLogger(true);
  }

  function onFab() {
    if (draft) openLogger();
    else setShowStart(true);
  }

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col">
      <div className="flex flex-1 flex-col gap-4 px-5 pt-12 pb-32 sm:px-6">
        {error && (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger-soft">
            <span>{error}</span>
            <button
              onClick={retryHydrate}
              disabled={retrying}
              className="shrink-0 rounded-lg border border-danger/40 px-3 py-1 text-xs font-semibold text-danger-soft transition-colors hover:bg-danger/10 disabled:opacity-60"
            >
              {retrying ? "Retrying…" : "Retry"}
            </button>
          </div>
        )}

        {!loaded ? (
          <div className="flex flex-1 items-center justify-center text-ink-soft">
            Loading your data…
          </div>
        ) : (
          <main className="flex-1">
            {active === "home" && (
              <Dashboard
                onStart={() => setShowStart(true)}
                onContinue={openLogger}
                onOpenProfile={() => setActive("profile")}
                userEmail={userEmail}
              />
            )}
            {active === "history" && (
              <History onStart={openLogger} onNew={() => setShowStart(true)} />
            )}
            {active === "progress" && <Progress />}
            {active === "profile" && <Tools userEmail={userEmail} />}
          </main>
        )}
      </div>

      <RestTimer
        bottomOffset={
          showLogger
            ? "calc(env(safe-area-inset-bottom) + 4.75rem)"
            : "calc(env(safe-area-inset-bottom) + 6.5rem)"
        }
      />
      <Toaster />
      <DialogHost />
      <UpdateBanner />
      <InstallPrompt />

      {/* Shojin bottom bar: section nav with a raised amber FAB */}
      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line-2"
        style={{
          background: "color-mix(in srgb, var(--color-bg) 82%, transparent)",
          backdropFilter: "blur(18px) saturate(160%)",
          WebkitBackdropFilter: "blur(18px) saturate(160%)",
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          <TabBar
            tabs={TABS}
            active={active}
            onChange={setActive}
            onFab={onFab}
            fabActive={!!draft}
            fabEditing={!!draft?.workoutId}
          />
        </div>
      </nav>

      {showStart && (
        <StartModal
          onClose={() => setShowStart(false)}
          onStart={() => {
            setShowStart(false);
            setShowLogger(true);
          }}
        />
      )}

      {showLogger && draft && (
        <WorkoutLogger onClose={() => setShowLogger(false)} />
      )}
    </div>
  );
}
