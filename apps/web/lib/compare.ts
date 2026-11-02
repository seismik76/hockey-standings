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

/** "+1.7" or "−0.4" goals a game. */
export function perGame(goals: number, games: number): string {
  if (games === 0) return "0.0";
  const v = goals / games;
  const s = Math.abs(v).toFixed(1);
  return v > 0.05 ? `+${s}` : v < -0.05 ? `−${s}` : s;
}

/** The bar chart's x domain: 20% to 80%, wide enough for every community so far. */
export const BAR_MIN = 0.2;
export const BAR_MAX = 0.8;

/** A share as a left offset in the bar track, 0 to 100, clamped to the domain. */
export function barPosition(share: number): number {
  const clamped = Math.min(BAR_MAX, Math.max(BAR_MIN, share));
  return ((clamped - BAR_MIN) / (BAR_MAX - BAR_MIN)) * 100;
}
