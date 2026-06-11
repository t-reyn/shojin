"use client";

import { useSyncExternalStore } from "react";

export type ThemePref = "system" | "light" | "dark";

const KEY = "shojin-theme";

function read(): ThemePref {
  if (typeof window === "undefined") return "system";
  try {
    const v = window.localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

/** Push the preference onto <html data-theme> (absent = follow system). */
function apply(pref: ThemePref) {
  const el = document.documentElement;
  if (pref === "system") el.removeAttribute("data-theme");
  else el.setAttribute("data-theme", pref);
}

const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);

  function onStorage(event: StorageEvent) {
    if (event.key !== KEY) return;
    if (event.newValue === event.oldValue) return;
    const pref: ThemePref = event.newValue === "light" || event.newValue === "dark" ? event.newValue : "system";
    apply(pref);
    cb();
  }
  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function setThemePref(pref: ThemePref) {
  try {
    if (pref === "system") window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, pref);
  } catch {}
  apply(pref);
  listeners.forEach((cb) => cb());
}

/** React hook: current preference, re-renders when it changes. */
export function useThemePref(): ThemePref {
  return useSyncExternalStore(subscribe, read, () => "system");
}
