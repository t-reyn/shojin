"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

type Step = "email" | "sending" | "sent" | "processing" | "error";

export function Login() {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<Step>("email");
  const [error, setError] = useState("");

  async function sendLink(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setStep("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setStep("error");
    } else {
      setStep("sent");
    }
  }

  async function handlePastedUrl(raw: string) {
    const trimmed = raw.trim();
    if (!trimmed.includes("://")) return;
    setStep("processing");
    setError("");
    try {
      const parsed = new URL(trimmed);

      // PKCE flow: ?code=...
      const code = parsed.searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) { setError(error.message); setStep("sent"); }
        return;
      }

      // Implicit flow: #access_token=...&refresh_token=...
      const hash = new URLSearchParams(parsed.hash.slice(1));
      const access_token = hash.get("access_token");
      const refresh_token = hash.get("refresh_token");
      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) { setError(error.message); setStep("sent"); }
        return;
      }

      setError("Couldn't read the link — make sure you copied the full URL.");
      setStep("sent");
    } catch {
      setError("Invalid URL. Copy the full sign-in link from your email.");
      setStep("sent");
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-1 flex-col justify-center gap-6 p-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          Iron<span className="text-ember">Log</span>
        </h1>
        <p className="mt-1 text-ink-soft">Track lifts, progress, and streaks.</p>
      </div>

      {step === "sent" || step === "processing" ? (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-ink-soft">
            Sign-in link sent to{" "}
            <span className="font-medium text-ink">{email}</span>.
          </p>

          <div className="rounded-lg border border-line bg-surface/70 p-4 text-sm text-ink-soft">
            <p className="mb-2 font-medium text-ink">Using this app from your home screen?</p>
            <ol className="flex flex-col gap-1 pl-4" style={{ listStyleType: "decimal" }}>
              <li>Open the email on your phone</li>
              <li>Long-press the sign-in link → <span className="text-ink">Copy</span></li>
              <li>Come back here and paste it below</li>
            </ol>
          </div>

          <textarea
            rows={3}
            placeholder="Paste sign-in link here…"
            className="w-full resize-none rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-ember"
            onChange={(e) => handlePastedUrl(e.target.value)}
            disabled={step === "processing"}
          />

          {step === "processing" && (
            <p className="text-sm text-ink-faint">Signing in…</p>
          )}

          {error && <p className="text-sm text-ember-soft">{error}</p>}

          <button
            onClick={() => { setStep("email"); setError(""); }}
            className="text-sm text-ink-faint hover:text-ink-soft"
          >
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={sendLink} className="flex flex-col gap-3">
          <label className="text-sm text-ink-soft" htmlFor="email">
            Email address
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
          <button
            type="submit"
            disabled={step === "sending"}
            className="rounded-lg bg-ember px-4 py-2 font-medium text-night transition hover:bg-ember-soft disabled:opacity-60"
          >
            {step === "sending" ? "Sending…" : "Send sign-in link"}
          </button>
          {step === "error" && (
            <p className="text-sm text-ember-soft">{error}</p>
          )}
        </form>
      )}
    </div>
  );
}
