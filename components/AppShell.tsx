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
import { DashboardIcon, LogIcon, ProgressIcon, ToolsIcon } from "./TabIcons";

type TabId = "dashboard" | "log" | "progress" | "tools";

const TABS: TabDef<TabId>[] = [
  { id: "dashboard", label: "Dashboard", icon: <DashboardIcon /> },
  { id: "log", label: "Log", icon: <LogIcon /> },
  { id: "progress", label: "Progress", icon: <ProgressIcon /> },
  { id: "tools", label: "Tools", icon: <ToolsIcon /> },
];

export function AppShell({ userEmail }: { userEmail: string }) {
  const [active, setActive] = useState<TabId>("dashboard");
  const loaded = useStore((s) => s.loaded);
  const hydrate = useStore((s) => s.hydrate);
  const draft = useStore((s) => s.draft);
  const [error, setError] = useState("");
  const [showStart, setShowStart] = useState(false);
  const [showLogger, setShowLogger] = useState(false);

  useEffect(() => {
    hydrate().catch((e) => setError(e.message ?? String(e)));
  }, [hydrate]);

  function openLogger() {
    setShowLogger(true);
  }

  return (
    <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-3xl flex-col">
      <div className="flex flex-1 flex-col gap-4 p-4 pb-36 sm:p-6 sm:pb-36">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">
            Iron<span className="text-ember">Log</span>
          </h1>
          <span className="hidden text-xs text-ink-faint sm:block">{userEmail}</span>
        </header>

        {error && (
          <div className="rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm text-danger-soft">
            {error}
          </div>
        )}

        {!loaded ? (
          <div className="flex flex-1 items-center justify-center text-ink-soft">
            Loading your data…
          </div>
        ) : (
          <main className="flex-1">
            {active === "dashboard" && <Dashboard onStart={() => setShowStart(true)} />}
            {active === "log" && (
              <History onStart={openLogger} onNew={() => setShowStart(true)} />
            )}
            {active === "progress" && <Progress />}
            {active === "tools" && <Tools />}
          </main>
        )}
      </div>

      <RestTimer
        bottomOffset={
          showLogger
            ? "calc(env(safe-area-inset-bottom) + 4.75rem)"
            : "calc(env(safe-area-inset-bottom) + 8.5rem)"
        }
      />
      <Toaster />
      <DialogHost />

      {/* Persistent bottom bar: primary action + section nav (thumb reach) */}
      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-night/95 backdrop-blur">
        <div className="mx-auto w-full max-w-3xl px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            onClick={draft ? openLogger : () => setShowStart(true)}
            className="mb-2 w-full rounded-xl bg-ember py-3 text-center font-semibold text-night hover:bg-ember-soft"
          >
            {draft ? "Continue workout →" : "Start workout"}
          </button>
          <TabBar tabs={TABS} active={active} onChange={setActive} />
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
