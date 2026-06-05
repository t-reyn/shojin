"use client";

import { useEffect, useState } from "react";
import { ShojinIcon } from "./ShojinLogo";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const KEY_DISMISSED = "shojin-install-dismissed";
const KEY_LAUNCHES = "shojin-launches";
const DELAY_MS = 8000; // let people look around before nudging

/** Fired by the "How to install" control in Profile to re-open the guide. */
export const OPEN_INSTALL_EVENT = "shojin:open-install";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/** iOS share glyph — the box-with-up-arrow people tap to "Add to Home Screen". */
function ShareGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3v12" />
      <path d="M8 7l4-4 4 4" />
      <path d="M7 11H6a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-7a1 1 0 0 0-1-1h-1" />
    </svg>
  );
}

/**
 * Dismissable "add to home screen" guide. Never shows in the installed PWA,
 * never on a user's first launch, and only after a short in-session delay — so
 * people explore the app first. Can be re-opened from Profile via OPEN_INSTALL_EVENT.
 */
export function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) return;

    // Manual re-open from Profile — bypasses the launch/dismiss gating.
    const onOpen = () => {
      setIos(isIOS());
      setVisible(true);
    };
    window.addEventListener(OPEN_INSTALL_EVENT, onOpen);

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);

    const onInstalled = () => {
      setVisible(false);
      try {
        localStorage.setItem(KEY_DISMISSED, "1");
      } catch {}
    };
    window.addEventListener("appinstalled", onInstalled);

    // Auto-show gating: not previously dismissed, and not the first ever launch.
    let dismissed = false;
    let launches = 0;
    try {
      dismissed = localStorage.getItem(KEY_DISMISSED) === "1";
      launches = (parseInt(localStorage.getItem(KEY_LAUNCHES) ?? "0", 10) || 0) + 1;
      localStorage.setItem(KEY_LAUNCHES, String(launches));
    } catch {}

    let t: ReturnType<typeof setTimeout> | undefined;
    if (!dismissed && launches >= 2) {
      t = setTimeout(() => {
        setIos(isIOS());
        setVisible(true);
      }, DELAY_MS);
    }

    return () => {
      window.removeEventListener(OPEN_INSTALL_EVENT, onOpen);
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
      if (t) clearTimeout(t);
    };
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(KEY_DISMISSED, "1");
    } catch {}
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    dismiss();
  }

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 z-30 px-4"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 6.75rem)" }}
    >
      <div className="mx-auto flex max-w-3xl items-center gap-3 rounded-[24px] border border-line-2 bg-surface p-3.5 shadow-[var(--rp-shadow)]">
        <ShojinIcon size={44} radius={13} shadow={false} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold tracking-[-0.01em] text-ink">Add Shojin to your home screen</div>
          {ios ? (
            <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[12.5px] leading-snug text-ink-soft">
              <span>Tap</span>
              <span className="shojin-nudge inline-flex items-center justify-center rounded-md bg-amber-soft px-1.5 py-0.5 text-amber-ink">
                <ShareGlyph />
              </span>
              <span>then</span>
              <span className="font-semibold text-ink">Add to Home Screen</span>
            </div>
          ) : (
            <div className="mt-0.5 text-[12.5px] leading-snug text-ink-soft">
              Full-screen, faster, and works offline.
            </div>
          )}
        </div>
        {!ios && deferred && (
          <button
            onClick={install}
            className="shrink-0 rounded-full bg-amber px-4 py-2 text-sm font-bold text-on-amber"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base text-ink-faint hover:bg-surface-2 hover:text-ink"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
