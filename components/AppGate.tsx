"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { hasSupabase, supabase } from "@/lib/supabase";
import { useStore } from "@/lib/store";
import { Login } from "./Login";
import { AppShell } from "./AppShell";
import { Onboarding } from "./Onboarding";
import { SetupNotice } from "./SetupNotice";

export function AppGate() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!hasSupabase);

  useEffect(() => {
    if (!hasSupabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!hasSupabase) return <SetupNotice />;

  if (!ready) {
    return (
      <div className="flex flex-1 items-center justify-center text-ink-soft">
        Loading…
      </div>
    );
  }

  if (!session) return <Login />;
  return <AuthedApp userEmail={session.user.email ?? ""} />;
}

/** Hydrates the store, then gates first-run onboarding before the main app.
 *  Onboarding writes `onboarded_at`, which flips this branch to <AppShell />. */
function AuthedApp({ userEmail }: { userEmail: string }) {
  const loaded = useStore((s) => s.loaded);
  const profile = useStore((s) => s.profile);
  const hydrate = useStore((s) => s.hydrate);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!useStore.getState().loaded) hydrate().catch((e) => setError(e.message ?? String(e)));
  }, [hydrate]);

  if (error) {
    return (
      <div className="mx-auto flex min-h-[100dvh] max-w-3xl flex-1 items-center justify-center px-6 text-center text-sm text-danger-soft">
        {error}
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="flex min-h-[100dvh] flex-1 items-center justify-center text-ink-soft">
        Loading your data…
      </div>
    );
  }

  if (!profile?.onboarded_at) return <Onboarding />;

  return <AppShell userEmail={userEmail} />;
}
