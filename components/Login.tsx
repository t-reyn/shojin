"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Mode = "signin" | "signup";
type Status = "idle" | "busy" | "error";

export function Login() {
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
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
      setError(error.message);
      setStatus("error");
    } else {
      setStatus("idle");
    }
  }

  function switchMode(m: Mode) {
    setMode(m);
    setError("");
    setPassword("");
    setConfirm("");
  }

  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Iron<span className="text-ember">Log</span>
        </h1>
        <p className="mt-1 text-ink-soft">Track lifts, progress, and streaks.</p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <label className="text-sm text-ink-soft" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-lg border border-line bg-surface px-3 py-2 text-ink outline-none focus:border-ember"
        />

        <label className="text-sm text-ink-soft" htmlFor="password">
          Password
        </label>
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
            <label className="text-sm text-ink-soft" htmlFor="confirm">
              Confirm password
            </label>
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
          className="rounded-lg bg-ember px-4 py-2 font-medium text-night transition hover:bg-ember-soft disabled:opacity-60"
        >
          {status === "busy"
            ? mode === "signin" ? "Signing in…" : "Creating account…"
            : mode === "signin" ? "Sign in" : "Create account"}
        </button>
      </form>

      <p className="text-center text-sm text-ink-faint">
        {mode === "signin" ? (
          <>
            No account?{" "}
            <button onClick={() => switchMode("signup")} className="text-ink-soft hover:text-ink">
              Sign up
            </button>
          </>
        ) : (
          <>
            Already have an account?{" "}
            <button onClick={() => switchMode("signin")} className="text-ink-soft hover:text-ink">
              Sign in
            </button>
          </>
        )}
      </p>
    </div>
  );
}
