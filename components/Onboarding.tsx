"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useStore } from "@/lib/store";
import { updateProfile, upsertBodyweight } from "@/lib/db";
import { Icon } from "./ShojinUI";
import { ShojinIcon, ShojinWordmark } from "./ShojinLogo";
import type { Goal, Unit } from "@/lib/types";

type IconName = Parameters<typeof Icon>[0]["name"];

const GOALS: { id: Goal; label: string; icon: IconName }[] = [
  { id: "muscle", label: "Build muscle", icon: "dumbbell" },
  { id: "strength", label: "Get stronger", icon: "arrowUp" },
  { id: "fat", label: "Lose fat", icon: "flame" },
  { id: "consistent", label: "Stay consistent", icon: "check" },
];

const REST_MIN = 30;
const REST_MAX = 300;
const REST_STEP = 15;

export const OPEN_IMPORT_FLAG = "shojin-open-import";

type Source = "strong" | "hevy" | "other" | "fresh";
const SOURCES: { id: Source; label: string; icon: IconName }[] = [
  { id: "strong", label: "Strong", icon: "dumbbell" },
  { id: "hevy", label: "Hevy", icon: "dumbbell" },
  { id: "other", label: "Another app", icon: "filter" },
  { id: "fresh", label: "Starting fresh", icon: "flame" },
];
const IMPORT_HINTS: Record<"strong" | "hevy" | "other", string> = {
  strong: "In Strong: Profile → Settings → Export Data (CSV). We’ll open the importer next.",
  hevy: "In Hevy: Settings → Export & Backup → Export Workouts (CSV). We’ll open the importer next.",
  other: "Export your history as CSV from your current app — we’ll open the importer next. It reads Strong, Hevy, and most CSVs.",
};

function fmtRest(s: number): string {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const labelCls = "mb-2 ml-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-ink-faint";
const fieldCls =
  "flex h-14 items-center gap-2.5 rounded-2xl border-[1.5px] border-line bg-surface px-4 focus-within:border-green-ink";

/** Progress dots for the data steps (Basics · Where · Aim · History). */
function Dots({ active, count }: { active: number; count: number }) {
  return (
    <div className="flex items-center gap-1.5" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => i).map((i) => (
        <span
          key={i}
          className="h-[5px] rounded-full transition-all duration-200 motion-reduce:transition-none"
          style={{
            width: i === active ? 26 : 18,
            background: i === active ? "var(--color-amber)" : "var(--color-line)",
          }}
        />
      ))}
    </div>
  );
}

function Head({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mb-7">
      <h1 className="text-[27px] font-extrabold tracking-[-0.025em]">{title}</h1>
      <p className="mt-1.5 text-[15px] leading-[1.4] text-ink-soft">{sub}</p>
    </div>
  );
}

/** Shared chrome for the three data cards: header (back · dots · skip),
 *  scrollable content, and a pinned amber CTA. */
function WizardFrame({
  active,
  count = 4,
  canSkip,
  onSkip,
  onBack,
  cta,
  ctaIcon,
  onCta,
  ctaDisabled,
  children,
}: {
  active: number;
  count?: number;
  canSkip?: boolean;
  onSkip?: () => void;
  onBack?: () => void;
  cta: string;
  ctaIcon: IconName;
  onCta: () => void;
  ctaDisabled?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex h-7 items-center justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              aria-label="Back"
              className="-ml-1 flex text-ink-faint transition-transform active:scale-90"
            >
              <Icon name="chevron" size={20} style={{ transform: "rotate(180deg)" }} />
            </button>
          )}
          <Dots active={active} count={count} />
        </div>
        {canSkip ? (
          <button
            onClick={onSkip}
            className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint"
          >
            Skip
          </button>
        ) : (
          <span />
        )}
      </div>

      <div className="flex flex-1 flex-col pt-7">{children}</div>

      <button
        onClick={onCta}
        disabled={ctaDisabled}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-amber px-5 py-4 text-base font-bold text-on-amber transition active:scale-[0.99] disabled:opacity-50"
      >
        {cta}
        <Icon name={ctaIcon} size={18} color="var(--color-on-amber)" sw={2.4} />
      </button>
    </div>
  );
}

function UnitsToggle({ value, onChange }: { value: Unit; onChange: (u: Unit) => void }) {
  return (
    <div className="flex rounded-2xl border border-line bg-surface-2 p-1">
      {(["kg", "lb"] as Unit[]).map((u) => {
        const on = value === u;
        return (
          <button
            key={u}
            onClick={() => onChange(u)}
            aria-pressed={on}
            className={[
              "h-12 flex-1 rounded-xl text-[15px] font-bold transition-colors motion-reduce:transition-none",
              on ? "bg-green text-on-green" : "text-ink-soft",
            ].join(" ")}
          >
            {u}
          </button>
        );
      })}
    </div>
  );
}

function RestStepper({ value, onChange }: { value: number; onChange: (s: number) => void }) {
  const pct = ((value - REST_MIN) / (REST_MAX - REST_MIN)) * 100;
  const stepBtn =
    "flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-line bg-surface-2 text-[26px] font-bold leading-none text-ink transition active:scale-95 disabled:opacity-40";
  return (
    <div className="rounded-[28px] border border-line-2 bg-surface p-[18px] shadow-[var(--rp-shadow-sm)]">
      <div className="flex items-center justify-between gap-4">
        <button
          onClick={() => onChange(Math.max(REST_MIN, value - REST_STEP))}
          disabled={value <= REST_MIN}
          aria-label="Less rest"
          className={stepBtn}
        >
          −
        </button>
        <div className="flex flex-col items-center">
          <div className="rp-eyebrow" style={{ fontSize: 9 }}>
            MIN · SEC
          </div>
          <div className="mt-1 font-mono text-[34px] font-extrabold leading-none tracking-[-0.03em]">
            {fmtRest(value)}
          </div>
        </div>
        <button
          onClick={() => onChange(Math.min(REST_MAX, value + REST_STEP))}
          disabled={value >= REST_MAX}
          aria-label="More rest"
          className={stepBtn}
        >
          +
        </button>
      </div>
      <div className="mt-4 h-[5px] rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-green transition-all duration-150 motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function GoalChips({ value, onChange }: { value: Goal | null; onChange: (g: Goal | null) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2.5">
      {GOALS.map((g) => {
        const on = value === g.id;
        return (
          <button
            key={g.id}
            onClick={() => onChange(on ? null : g.id)}
            aria-pressed={on}
            className={[
              "flex items-center gap-2.5 rounded-[18px] p-3.5 text-left text-[14.5px] font-semibold transition-colors motion-reduce:transition-none",
              on
                ? "bg-green text-on-green"
                : "border border-line bg-surface text-ink shadow-[var(--rp-shadow-sm)]",
            ].join(" ")}
          >
            <Icon
              name={g.icon}
              size={19}
              color={on ? "var(--color-amber)" : "var(--color-ink-faint)"}
            />
            {g.label}
          </button>
        );
      })}
    </div>
  );
}

function DaysPicker({ value, onChange }: { value: number; onChange: (d: number) => void }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5, 6, 7].map((d) => {
        const on = value === d;
        return (
          <button
            key={d}
            onClick={() => onChange(d)}
            aria-pressed={on}
            className={[
              "h-[46px] flex-1 rounded-[14px] font-mono text-base font-bold transition-colors motion-reduce:transition-none",
              on ? "bg-green text-on-green" : "border border-line bg-surface text-ink-soft",
            ].join(" ")}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

export function Onboarding() {
  const profile = useStore((s) => s.profile);
  const bodyweight = useStore((s) => s.bodyweight);
  const workouts = useStore((s) => s.workouts);
  const refreshProfile = useStore((s) => s.refreshProfile);
  const refreshBodyweight = useStore((s) => s.refreshBodyweight);

  const returning = workouts.length > 0;
  const latestBw = useMemo(
    () => (bodyweight.length ? bodyweight[bodyweight.length - 1] : null),
    [bodyweight],
  );

  const [step, setStep] = useState(0);
  const [name, setName] = useState(profile?.display_name ?? "");
  const [unit, setUnit] = useState<Unit>(profile?.unit ?? "kg");
  const [bw, setBw] = useState("");
  const [rest, setRest] = useState(profile?.default_rest_seconds ?? 90);
  const [goal, setGoal] = useState<Goal | null>(profile?.goal ?? null);
  const [days, setDays] = useState(profile?.days_per_week ?? 4);
  const [source, setSource] = useState<Source | null>(null);
  const [saving, setSaving] = useState(false);

  const back = () => setStep((s) => Math.max(0, s - 1));
  const next = () => setStep((s) => Math.min(4, s + 1));

  async function finish(openImport = false) {
    if (saving) return;
    setSaving(true);
    try {
      const patch: Parameters<typeof updateProfile>[0] = {
        unit,
        default_rest_seconds: rest,
        days_per_week: days,
        onboarded_at: new Date().toISOString(),
      };
      const trimmed = name.trim();
      if (trimmed) patch.display_name = trimmed;
      if (goal) patch.goal = goal;
      await updateProfile(patch);

      const bwNum = parseFloat(bw);
      if (Number.isFinite(bwNum) && bwNum > 0) {
        await upsertBodyweight(bwNum, unit);
        await refreshBodyweight();
      }
      // Land on Profile → Data so they can import (set before the gate flips).
      if (openImport) {
        try {
          localStorage.setItem(OPEN_IMPORT_FLAG, "1");
        } catch {}
      }
      // Flips profile.onboarded_at → the gate falls through to AppShell.
      await refreshProfile();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-center bg-bg">
      <div
        className="flex w-full max-w-md flex-col px-6"
        style={{
          paddingTop: "max(env(safe-area-inset-top), 20px)",
          paddingBottom: "max(env(safe-area-inset-bottom), 28px)",
        }}
      >
        {/* 0 · Welcome */}
        {step === 0 && (
          <div className="flex flex-1 flex-col">
            <div className="flex flex-1 flex-col items-center justify-center text-center">
              <ShojinIcon size={78} radius={20} />
              <div className="mt-5">
                <ShojinWordmark size={34} color="var(--color-ink)" />
              </div>
              <div className="mt-3 font-mono text-[10.5px] font-semibold uppercase tracking-[0.26em] text-amber">
                Continuous effort
              </div>
              <div className="my-7 h-10 w-px bg-line" />
              <h1 className="max-w-[280px] text-[27px] font-extrabold leading-[1.12] tracking-[-0.025em]">
                {returning ? (
                  "Welcome back."
                ) : (
                  <>
                    Small steps,
                    <br />
                    every session.
                  </>
                )}
              </h1>
              <p className="mt-3 max-w-[270px] text-[15px] leading-[1.45] text-ink-soft">
                {returning
                  ? "A few new touches since you last lifted — add your name and aim, or skip straight back to training."
                  : "A quiet log for your training — every set, every rep, none of the noise."}
              </p>
            </div>
            <div className="flex flex-col items-center gap-3.5">
              <button
                onClick={next}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-amber px-5 py-4 text-base font-bold text-on-amber transition active:scale-[0.99]"
              >
                {returning ? "Add your details" : "Get started"}
                <Icon name="chevron" size={18} color="var(--color-on-amber)" sw={2.4} />
              </button>
              {returning ? (
                <button
                  onClick={() => finish(false)}
                  disabled={saving}
                  className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-faint disabled:opacity-50"
                >
                  Skip — edit later in Profile
                </button>
              ) : (
                <div className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-faint">
                  Takes about 15 seconds
                </div>
              )}
            </div>
          </div>
        )}

        {/* 1 · The basics */}
        {step === 1 && (
          <WizardFrame
            active={0}
            canSkip={returning}
            onSkip={next}
            onBack={back}
            cta="Continue"
            ctaIcon="chevron"
            onCta={next}
          >
            <Head
              title="The basics"
              sub={returning ? "Add your name — the rest is already set." : "Two quick things, then you’re in."}
            />
            <div className="flex flex-col gap-5">
              <div>
                <div className={labelCls}>Your name</div>
                <label className={fieldCls}>
                  <Icon name="profile" size={19} color="var(--color-ink-faint)" />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="What should we call you?"
                    maxLength={40}
                    className="min-w-0 flex-1 bg-transparent text-base font-medium text-ink outline-none placeholder:text-ink-faint"
                  />
                </label>
              </div>
              <div>
                <div className={labelCls}>Units</div>
                <UnitsToggle value={unit} onChange={setUnit} />
                <p className="mt-2 ml-1 font-mono text-[11px] text-ink-faint">
                  Used everywhere you log. Switch anytime in Profile.
                </p>
              </div>
            </div>
          </WizardFrame>
        )}

        {/* 2 · Where you’re at */}
        {step === 2 && (
          <WizardFrame
            active={1}
            canSkip
            onSkip={next}
            onBack={back}
            cta="Continue"
            ctaIcon="chevron"
            onCta={next}
          >
            <Head title="Where you’re at" sub="Optional — gives your charts a starting point." />
            <div className="flex flex-col gap-5">
              <div>
                <div className={labelCls}>Current bodyweight</div>
                <label className={fieldCls}>
                  <input
                    type="number"
                    inputMode="decimal"
                    value={bw}
                    onChange={(e) => setBw(e.target.value)}
                    placeholder={latestBw ? String(latestBw.weight) : "e.g. 75"}
                    className="min-w-0 flex-1 bg-transparent font-mono text-base font-medium text-ink outline-none placeholder:text-ink-faint"
                  />
                  <span className="font-mono text-sm text-ink-faint">{unit}</span>
                </label>
              </div>
              <div>
                <div className={labelCls}>Default rest</div>
                <RestStepper value={rest} onChange={setRest} />
                <p className="mt-2 ml-1 font-mono text-[11px] text-ink-faint">
                  Starts the timer after each working set. Override it per exercise later.
                </p>
              </div>
            </div>
          </WizardFrame>
        )}

        {/* 3 · Your aim */}
        {step === 3 && (
          <WizardFrame
            active={2}
            canSkip
            onSkip={next}
            onBack={back}
            cta="Continue"
            ctaIcon="chevron"
            onCta={next}
          >
            <Head title="Your aim" sub="Optional — shapes a couple of gentle nudges." />
            <div className="flex flex-col gap-6">
              <div>
                <div className={labelCls}>Primary goal</div>
                <GoalChips value={goal} onChange={setGoal} />
              </div>
              <div>
                <div className={labelCls}>Days / week</div>
                <DaysPicker value={days} onChange={setDays} />
              </div>
            </div>
          </WizardFrame>
        )}

        {/* 4 · Bring your history */}
        {step === 4 && (
          <WizardFrame
            active={3}
            canSkip
            onSkip={() => finish(false)}
            onBack={back}
            cta={
              source && source !== "fresh"
                ? saving
                  ? "Importing…"
                  : "Finish & import"
                : saving
                  ? "Finishing…"
                  : "Finish setup"
            }
            ctaIcon="check"
            onCta={() => finish(!!source && source !== "fresh")}
            ctaDisabled={saving}
          >
            <Head
              title="Bring your history"
              sub="Switching from another app? Import your past workouts."
            />
            <div className="grid grid-cols-2 gap-2.5">
              {SOURCES.map((s) => {
                const on = source === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setSource(on ? null : s.id)}
                    aria-pressed={on}
                    className={[
                      "flex items-center gap-2.5 rounded-[18px] p-3.5 text-left text-[14.5px] font-semibold transition-colors motion-reduce:transition-none",
                      on
                        ? "bg-green text-on-green"
                        : "border border-line bg-surface text-ink shadow-[var(--rp-shadow-sm)]",
                    ].join(" ")}
                  >
                    <Icon
                      name={s.icon}
                      size={19}
                      color={on ? "var(--color-amber)" : "var(--color-ink-faint)"}
                    />
                    {s.label}
                  </button>
                );
              })}
            </div>
            {source && source !== "fresh" && (
              <p className="mt-4 rounded-2xl border border-line bg-surface-2 p-3.5 text-[13px] leading-[1.45] text-ink-soft">
                {IMPORT_HINTS[source]}
              </p>
            )}
            {source === "fresh" && (
              <p className="mt-4 ml-1 font-mono text-[11px] text-ink-faint">
                No problem — you can always import later from Profile → Data.
              </p>
            )}
          </WizardFrame>
        )}
      </div>
    </div>
  );
}
