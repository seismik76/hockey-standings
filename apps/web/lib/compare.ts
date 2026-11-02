// What the home page's community comparison needs beyond @hockey/core: which
// phase to show, and how a share maps onto the charts. Pure, so it is tested.
import type { PhaseKind } from "@hockey/db";

export type ComparePhase = Extract<PhaseKind, "seeding" | "regular">;

export const COMPARE_PHASES: readonly ComparePhase[] = ["seeding", "regular"];

/** Fewer games than this in a cell and it is faded: one team's run can swing it. */
export const THIN_GAMES = 10;

/**
 * Seeding until the regular season has played as many tiered games as it has
 * tiered teams (about two games a team), then the regular season. A phase
 * asked for by name is shown if it has any games at all.
 */
export function pickPhase(
  coverage: readonly { phase: PhaseKind; teams: number; finals: number }[],
  asked: string | undefined,
): { phase: ComparePhase; available: ComparePhase[] } {
  const of = (p: ComparePhase) => coverage.find((c) => c.phase === p);
  const available = COMPARE_PHASES.filter((p) => (of(p)?.finals ?? 0) > 0);
  if (asked && (available as string[]).includes(asked)) {
    return { phase: asked as ComparePhase, available };
  }
  const regular = of("regular");
  const regularReady =
    regular !== undefined && regular.teams > 0 && regular.finals >= regular.teams;
  return { phase: regularReady ? "regular" : "seeding", available };
}

/**
 * The heatmap's seven classes, -3 to 3: below even to above even. Bins rather
 * than a continuous ramp, so a reader can match a cell to the legend; every
 * cell prints its number too.
 */
export const SHARE_BINS = [
  { step: -3, label: "under 30%", below: 0.3 },
  { step: -2, label: "30–39%", below: 0.4 },
  { step: -1, label: "40–46%", below: 0.47 },
  { step: 0, label: "47–53%", below: 0.54 },
  { step: 1, label: "54–60%", below: 0.61 },
  { step: 2, label: "61–70%", below: 0.71 },
  { step: 3, label: "over 70%", below: Infinity },
] as const;

/** Bins on the rounded percentage, so a cell printing "47" is always in the 47–53% class. */
export function shareStep(share: number): number {
  const rounded = Math.round(share * 100) / 100;
  return SHARE_BINS.find((b) => rounded < b.below)!.step;
}

export function percent(share: number): string {
  return `${Math.round(share * 100)}%`;
}

/**
 * A value in whole tenths, rounding halves away from zero so +x and −x always
 * mirror. Cells print it and bin on it, so the two always agree.
 */
export function tenths(v: number): number {
  return Math.sign(v) * Math.round(Math.abs(v) * 10);
}

/** "+1.7", "−0.4" or "0.0" from a count of tenths. */
function fromTenths(t: number): string {
  if (t === 0) return "0.0";
  return `${t > 0 ? "+" : "−"}${(Math.abs(t) / 10).toFixed(1)}`;
}

/** "+1.7" or "−0.4" goals a game. */
export function perGame(goals: number, games: number): string {
  return games === 0 ? "0.0" : fromTenths(tenths(goals / games));
}

/** The bar chart's x domain: 20% to 80%, wide enough for every community so far. */
export const BAR_MIN = 0.2;
export const BAR_MAX = 0.8;

/** A share as a left offset in the bar track, 0 to 100, clamped to the domain. */
export function barPosition(share: number): number {
  const clamped = Math.min(BAR_MAX, Math.max(BAR_MIN, share));
  return ((clamped - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;
}

/**
 * The goal chart's domain: symmetric around zero, out to the widest range
 * any community has, rounded up to the half goal, and never under one goal.
 */
export function goalDomain(rows: readonly { diffLow: number; diffHigh: number }[]): number {
  const widest = Math.max(0, ...rows.flatMap((r) => [Math.abs(r.diffLow), Math.abs(r.diffHigh)]));
  return Math.max(1, Math.ceil(widest * 2) / 2);
}

/** A goal differential as a left offset in the bar track, 0 to 100, zero in the middle. */
export function goalPosition(diff: number, domain: number): number {
  const clamped = Math.min(domain, Math.max(-domain, diff));
  return 50 + (clamped / domain) * 50;
}

/** "+1.5", "−1.5", "0": tick labels. */
export function signed(v: number): string {
  if (v === 0) return "0";
  return `${v > 0 ? "+" : "−"}${Math.abs(v)}`;
}

/**
 * The goal-differential heatmap's seven classes, in goals a game, symmetric
 * around zero. `below` is in tenths of a goal, the precision a cell prints.
 */
export const DIFF_BINS = [
  { step: -3, label: "−2.0 or worse", below: -19 },
  { step: -2, label: "−1.9 to −1.0", below: -9 },
  { step: -1, label: "−0.9 to −0.3", below: -2 },
  { step: 0, label: "−0.2 to +0.2", below: 3 },
  { step: 1, label: "+0.3 to +0.9", below: 10 },
  { step: 2, label: "+1.0 to +1.9", below: 20 },
  { step: 3, label: "+2.0 or better", below: Infinity },
] as const;

/** Bins on the printed value, so a cell showing "+1.0" is in the +1.0 to +1.9 class. */
export function diffStep(diff: number): number {
  const t = tenths(diff);
  return DIFF_BINS.find((b) => t < b.below)!.step;
}
