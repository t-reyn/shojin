"use client";

import { useEffect, useRef, useState } from "react";

export function UpdateBanner() {
  const [waitingSW, setWaitingSW] = useState<ServiceWorker | null>(null);
  // Only reload when the user explicitly tapped "Update" — not on first SW activation.
  const userTriggered = useRef(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    let reg: ServiceWorkerRegistration | undefined;

    navigator.serviceWorker.register("/sw.js").then((registration) => {
      reg = registration;
      if (reg.waiting && navigator.serviceWorker.controller) {
        setWaitingSW(reg.waiting);
      }
      reg.addEventListener("updatefound", () => {
        const next = reg?.installing;
        if (!next) return;
        next.addEventListener("statechange", () => {
          if (next.state === "installed" && navigator.serviceWorker.controller) {
            setWaitingSW(next);
          }
        });
      });
    });

    const onControllerChange = () => {
      if (userTriggered.current) window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") reg?.update();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  if (!waitingSW) return null;

  function applyUpdate() {
    userTriggered.current = true;
    waitingSW?.postMessage("skipWaiting");
  }

  return (
    <div
      className="fixed left-3 right-3 z-[65] rounded-xl border border-ember/50 bg-surface/95 p-3 shadow-lg backdrop-blur sm:left-auto sm:right-4 sm:w-72"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 9.5rem)" }}
    >
      <p className="text-sm font-medium text-ink">Update available</p>
      <p className="mt-0.5 text-xs text-ink-faint">A new version of Shojin is ready.</p>
      <button
        onClick={applyUpdate}
        className="mt-2.5 w-full rounded-lg bg-ember py-2 text-sm font-medium text-on-accent hover:bg-ember-soft"
      >
        Tap to update
      </button>
    </div>
  );
}
