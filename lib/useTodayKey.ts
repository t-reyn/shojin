"use client";

import { useEffect, useState } from "react";
import { localDay } from "./stats";

/** Local YYYY-MM-DD that updates on tab focus/visibility change, so memos
 *  keyed on it recompute across midnight/month rollovers in a long-lived PWA
 *  session. */
export function useTodayKey(): string {
  const [key, setKey] = useState(() => localDay(new Date()));
  useEffect(() => {
    function check() {
      const k = localDay(new Date());
      setKey((prev) => (prev === k ? prev : k));
    }
    document.addEventListener("visibilitychange", check);
    window.addEventListener("focus", check);
    return () => {
      document.removeEventListener("visibilitychange", check);
      window.removeEventListener("focus", check);
    };
  }, []);
  return key;
}
