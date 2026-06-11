import type { Unit } from "./types";

/** 1 lb in kg. */
const KG_PER_LB = 0.45359237;

/** Convert a weight value between kg and lb (no-op if units already match). */
export function convertWeight(weight: number, from: Unit, to: Unit): number {
  if (from === to) return weight;
  return from === "lb" ? weight * KG_PER_LB : weight / KG_PER_LB;
}
