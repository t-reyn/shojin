"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup" | "recover-email" | "recover-paste";
type Status = "idle" | "busy" | "error";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  function reset(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
    setConfirm("");
  }

  async function submitAuth(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (mode === "signup" && password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setStatus("busy");
    const { error } =
      mode === "signin"
        ? await supabase.auth.signInWithPassword({ email: email.trim(), password })
        : await supabase.auth.signUp({ email: email.trim(), password });

    if (error) {
      if (error.message.toLowerCase().includes("already registered")) {
        setError("Account exists — sign in with your password, or use "Set a password" below if you haven't set one yet.");
      } else {
        setError(error.message);
      }
      setStatus("error");
    } else {
      setStatus("idle");
    }
  }

  async function sendRecovery(e: React.FormEvent) {
    e.preventDefault();
    setStatus("busy");
    setError("");
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: window.location.origin,
    });
    if (error) {
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("idle");
      setMode("recover-paste");
    }
  }

  async function handlePastedUrl(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed.includes("://")) return;
    setStatus("busy");
    setError("");
    try {
      const parsed = new URL(trimmed);
      const code = parsed.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); setStatus("error"); }
        return;
      }
      const hash = new URLSearchParams(parsed.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) { setError(error.message); setStatus("error"); }
        return;
      }
      setError("Couldn't read the link — copy the full URL from your email.");
      setStatus("error");
    } catch {
      setError("Invalid URL.");
      setStatus("error");
    }
  }

  /* ── Recovery: enter email ── */
  if (mode === "recover-email") {
    return (
      <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Iron<span className="text-ember">Log</span></h1>
          <p className="mt-1 text-ink-soft">Set a password</p>
        </div>
        <form onSubmit={sendRecovery} className="flex flex-col gap-3">
          <label className="text-sm text-ink-soft" htmlFor="rec-email">Email</label>
          <input
            id="rec-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ember"
          />
          {error && <p className="text-sm text-ember-soft">{error}</p>}
          <button
            type="submit"
            disabled={status === "busy"}
            className="rounded-lg bg-ember px-4 py-2 font-medium text-night hover:bg-ember-soft disabled:opacity-60"
          >
            {status === "busy" ? "Sending…" : "Send link"}
          </button>
        </form>
        <button onClick={() => reset("signin")} className="text-sm text-ink-faint hover:text-ink-soft">← Back to sign in</button>
      </div>
    );
  }

  /* ── Recovery: paste link ── */
  if (mode === "recover-paste") {
    return (
      <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Iron<span className="text-ember">Log</span></h1>
          <p className="mt-1 text-ink-soft">Set a password</p>
        </div>
        <div className="rounded-lg border border-line bg-surface/70 p-4 text-sm text-ink-soft">
          <p className="mb-2 font-medium text-ink">Check your email</p>
          <ol className="flex flex-col gap-1 pl-4" style={{ listStyleType: "decimal" }}>
            <li>Open the email on this device</li>
            <li>Long-press the link → <span className="text-ink">Copy</span></li>
            <li>Paste it below</li>
          </ol>
        </div>
        <textarea
          rows={3}
          placeholder="Paste link here…"
          disabled={status === "busy"}
          className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ember"
          onChange={(e) => handlePastedUrl(e.target.value)}
        />
        {status === "busy" && <p className="text-sm text-ink-faint">Signing in…</p>}
        {error && <p className="text-sm text-ember-soft">{error}</p>}
        <p className="text-sm text-ink-faint">
          Once you're in, go to <span className="text-ink">Tools → Change password</span> to set a permanent password.
        </p>
        <button onClick={() => reset("signin")} className="text-sm text-ink-faint hover:text-ink-soft">← Back to sign in</button>
      </div>
    );
  }

  /* ── Sign in / Sign up ── */
  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Iron<span className="text-ember">Log</span></h1>
        <p className="mt-1 text-ink-soft">Track lifts, progress, and streaks.</p>
      </div>

      <form onSubmit={submitAuth} className="flex flex-col gap-3">
        <label className="text-sm text-ink-soft" htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ember"
        />
        <label className="text-sm text-ink-soft" htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ember"
        />
        {mode === "signup" && (
          <>
            <label className="text-sm text-ink-soft" htmlFor="confirm">Confirm password</label>
            <input
              id="confirm"
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ember"
            />
          </>
        )}
        {error && <p className="text-sm text-ember-soft">{error}</p>}
        <button
          type="submit"
          disabled={status === "busy"}
          className="rounded-lg bg-ember px-4 py-2 font-medium text-night hover:bg-ember-soft disabled:opacity-60"
        >
          {status === "busy"
            ? mode === "signin" ? "Signing in…" : "Creating account…"
            : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <div className="flex flex-col gap-2 text-center text-sm text-ink-faint">
        {mode === "signin" ? (
          <>
            <span>
              No account?{" "}
              <button onClick={() => reset("signup")} className="text-ink-soft hover:text-ink">Sign up</button>
            </span>
            <span>
              No password yet?{" "}
              <button onClick={() => reset("recover-email")} className="text-ink-soft hover:text-ink">Set a password</button>
            </span>
          </>
        ) : (
          <span>
            Already have an account?{" "}
            <button onClick={() => reset("signin")} className="text-ink-soft hover:text-ink">Sign in</button>
          </span>
        )}
      </div>
    </div>
  );
}
