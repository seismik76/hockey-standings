// The home page's community comparison: ranked share bars and goal
// differential, each with its heatmap by age, and, once tiers come out of seeding, where each
// community's teams were placed.
// Server-rendered HTML and CSS only; tooltips are CSS, shown on hover and on
// focus, and every value they hold is also printed or in the heatmap.
import type { CommunityComparison, ShareRecord } from "@hockey/core";
import Link from "next/link";
import {
  BAR_MAX,
  BAR_MIN,
  DIFF_BINS,
  SHARE_BINS,
  THIN_GAMES,
  barPosition,
  diffStep,
  goalDomain,
  goalPosition,
  perGame,
  percent,
  shareStep,
  signed,
} from "@/lib/compare";

type Names = Map<string, string>;

export const stepClass = (step: number) =>
  step < 0 ? `sn${-step}` : step > 0 ? `sp${step}` : "s0";

export function recordLine(r: ShareRecord): string {
  return `${r.w}-${r.l}-${r.t} in ${r.gp} ${r.gp === 1 ? "game" : "games"} · ${perGame(r.gf - r.ga, r.gp)} goals a game`;
}

export function Tip({ title, lines }: { title: string; lines: string[] }) {
  return (
    <span className="tip-body" role="tooltip">
      <strong className="block">{title}</strong>
      {lines.map((l) => (
        <span key={l} className="block">
          {l}
        </span>
      ))}
    </span>
  );
}

export function ShareBars({ rows, names }: { rows: CommunityComparison[]; names: Names }) {
  const ticks = [0.3, 0.5, 0.7];
  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">Points share, all ages</h2>
        <p className="muted mt-0.5 text-sm">
          Share of points won against same-tier teams. The thin line is a rough 90% range for
          chance.
        </p>
      </figcaption>
      <ol className="mt-4 space-y-1">
        {rows.map(({ community, all, byAge }) => {
          const ages = [...byAge.values()];
          const above = ages.filter((r) => r.share > 0.5).length;
          const pos = barPosition(all.share);
          const left = Math.min(50, pos);
          const name = names.get(community) ?? community;
          return (
            <li key={community} className="share-row">
              <div className="row-name min-w-0">
                <Link href={`/c/${community}`} className="block truncate font-medium">
                  {name}
                </Link>
                <span className="muted block text-xs">
                  Above even in {above} of {ages.length} ages
                </span>
              </div>
              <div
                className="row-plot share-track tip tip-end"
                tabIndex={0}
                aria-label={`${name}: ${percent(all.share)} of points`}
              >
                <span
                  className={`share-bar ${all.share >= 0.5 ? "above" : "below"}`}
                  style={{ left: `${left}%`, width: `${Math.abs(pos - 50)}%` }}
                />
                <span
                  className="share-range"
                  style={{
                    left: `${barPosition(all.low)}%`,
                    width: `${barPosition(all.high) - barPosition(all.low)}%`,
                  }}
                />
                <Tip
                  title={`${name}: ${percent(all.share)}`}
                  lines={[
                    recordLine(all),
                    `Likely range ${percent(all.low)}–${percent(all.high)}`,
                    `Above even in ${above} of ${ages.length} age groups`,
                  ]}
                />
              </div>
              <span className="row-value text-right text-sm font-semibold tabular-nums">
                {percent(all.share)}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="share-row share-axis-row mt-1" aria-hidden="true">
        <div className="row-plot share-axis">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${barPosition(t)}%` }}>
              {t === 0.5 ? "even" : percent(t)}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">
        Bars run from {percent(BAR_MIN)} to {percent(BAR_MAX)}, starting at an even 50%.
      </p>
    </figure>
  );
}

export function GoalBars({
  rows,
  ages,
  names,
}: {
  rows: CommunityComparison[];
  ages: string[];
  names: Names;
}) {
  // Rows come ranked by goal differential (page.tsx).
  const domain = goalDomain(rows.map((r) => r.all));
  const ticks = [-domain, -domain / 2, 0, domain / 2, domain];
  const goals = (n: number, gp: number) => (gp === 0 ? "0.0" : (n / gp).toFixed(1));
  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">Goal differential, all ages</h2>
        <p className="muted mt-0.5 text-sm">
          Goals for minus goals against, per game, against same-tier teams. It shows how big the
          wins and losses are, not only how many. The thin line is a rough 90% range.
        </p>
      </figcaption>
      <ol className="mt-4 space-y-1">
        {rows.map(({ community, all, byAge }) => {
          const pos = goalPosition(all.diff, domain);
          const name = names.get(community) ?? community;
          const value = perGame(all.gf - all.ga, all.gp);
          const perAge = ages
            .filter((a) => (byAge.get(a)?.gp ?? 0) > 0)
            .map((a) => {
              const r = byAge.get(a)!;
              return `${a} ${perGame(r.gf - r.ga, r.gp)}`;
            })
            .join(" · ");
          return (
            <li key={community} className="share-row">
              <div className="row-name min-w-0">
                <Link href={`/c/${community}`} className="block truncate font-medium">
                  {name}
                </Link>
                <span className="muted block text-xs">
                  {goals(all.gf, all.gp)} for, {goals(all.ga, all.gp)} against a game
                </span>
              </div>
              <div
                className="row-plot share-track tip tip-end"
                tabIndex={0}
                aria-label={`${name}: ${value} goals a game`}
              >
                <span
                  className={`share-bar ${all.diff >= 0 ? "above" : "below"}`}
                  style={{ left: `${Math.min(50, pos)}%`, width: `${Math.abs(pos - 50)}%` }}
                />
                <span
                  className="share-range"
                  style={{
                    left: `${goalPosition(all.diffLow, domain)}%`,
                    width: `${goalPosition(all.diffHigh, domain) - goalPosition(all.diffLow, domain)}%`,
                  }}
                />
                <Tip
                  title={`${name}: ${value} a game`}
                  lines={[
                    `${goals(all.gf, all.gp)} scored, ${goals(all.ga, all.gp)} allowed in ${all.gp} games`,
                    `Likely range ${perGame(all.diffLow, 1)} to ${perGame(all.diffHigh, 1)}`,
                    perAge,
                  ]}
                />
              </div>
              <span className="row-value text-right text-sm font-semibold tabular-nums">
                {value}
              </span>
            </li>
          );
        })}
      </ol>
      <div className="share-row share-axis-row mt-1" aria-hidden="true">
        <div className="row-plot share-axis">
          {ticks.map((t) => (
            <span key={t} style={{ left: `${goalPosition(t, domain)}%` }}>
              {signed(t)}
            </span>
          ))}
        </div>
      </div>
      <p className="sr-only">
        Bars run from {signed(-domain)} to {signed(domain)} goals a game, starting at zero.
      </p>
    </figure>
  );
}

/** What a heatmap shows: points share or goal differential, both per age. */
const METRICS = {
  share: {
    title: "Points share by age group",
    caption:
      "Points share in each age, same order as the bars above. A row that stays one colour is a pattern across the whole community, not one strong team.",
    text: (r: ShareRecord) => String(Math.round(r.share * 100)),
    spoken: (r: ShareRecord) => percent(r.share),
    step: (r: ShareRecord) => shareStep(r.share),
    bins: SHARE_BINS,
    low: "Below even",
    high: "Above even",
  },
  diff: {
    title: "Goal differential by age group",
    caption:
      "Goals for minus against, per game, in each age, same order as the bars above. Big numbers mean lopsided games, not only more wins.",
    text: (r: ShareRecord) => perGame(r.gf - r.ga, r.gp),
    spoken: (r: ShareRecord) => `${perGame(r.gf - r.ga, r.gp)} goals a game`,
    step: (r: ShareRecord) => diffStep(r.diff),
    bins: DIFF_BINS,
    low: "Outscored",
    high: "Outscoring",
  },
} as const;

export function AgeHeatmap({
  rows,
  ages,
  names,
  metric,
}: {
  rows: CommunityComparison[];
  ages: string[];
  names: Names;
  metric: keyof typeof METRICS;
}) {
  const m = METRICS[metric];
  // The right half of the columns opens its tooltip leftwards, so it never
  // runs off a phone's screen.
  const end = (i: number) => i >= Math.floor((ages.length + 1) / 2);
  const cell = (community: string, label: string, r: ShareRecord | undefined, i: number) => {
    if (!r || r.gp === 0) {
      return (
        <td key={label} className="heat-empty">
          –
        </td>
      );
    }
    const name = names.get(community) ?? community;
    const thin = r.gp < THIN_GAMES;
    return (
      <td
        key={label}
        tabIndex={0}
        className={`heat-cell tip ${end(i) ? "tip-end" : "tip-start"} ${stepClass(m.step(r))}${thin ? " thin" : ""}`}
        aria-label={`${name} ${label}: ${m.spoken(r)}, ${r.gp} games`}
      >
        {m.text(r)}
        <Tip
          title={`${name} ${label}: ${m.spoken(r)}`}
          lines={[
            recordLine(r),
            `${percent(r.share)} of points`,
            ...(thin ? [`Fewer than ${THIN_GAMES} games: a small sample`] : []),
          ]}
        />
      </td>
    );
  };

  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">{m.title}</h2>
        <p className="muted mt-0.5 text-sm">{m.caption}</p>
      </figcaption>
      <table className={`heat mt-4 heat-${metric}`}>
        <thead>
          <tr>
            <th scope="col" className="heat-name">
              <span className="sr-only">Community</span>
            </th>
            {ages.map((a) => (
              <th key={a} scope="col">
                {a}
              </th>
            ))}
            <th scope="col">All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ community, all, byAge }) => (
            <tr key={community}>
              <th scope="row" className="heat-name">
                <Link href={`/c/${community}`}>{names.get(community) ?? community}</Link>
              </th>
              {ages.map((a, i) => cell(community, a, byAge.get(a), i))}
              {cell(community, "all ages", all, ages.length)}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="muted">{m.low}</span>
          <span className="flex gap-0.5" aria-hidden="true">
            {m.bins.map((b) => (
              <span key={b.step} className={`heat-swatch ${stepClass(b.step)}`} title={b.label} />
            ))}
          </span>
          <span className="muted">{m.high}</span>
        </div>
        <span className="muted">
          Faded: fewer than {THIN_GAMES} games. Classes: {m.bins.map((b) => b.label).join(", ")}.
        </span>
      </div>
    </figure>
  );
}

export function TierPlacement({
  rows,
  names,
  levels,
}: {
  rows: { community: string; teams: number; shares: number[] }[];
  names: Names;
  /** The level of each share: 0 is AA, then Tier 1 down. */
  levels: number[];
}) {
  const label = (level: number) => (level === 0 ? "AA" : `Tier ${level}`);
  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">Where teams were placed</h2>
        <p className="muted mt-0.5 text-sm">
          Each community&apos;s regular-season teams by level, from AA down. More dark blue means
          more teams at the top. U15 and U18 stop at Tier 4; AA is U11 and U13 only.
        </p>
      </figcaption>
      <ol className="mt-4 space-y-1.5">
        {rows.map(({ community, teams, shares }) => {
          const name = names.get(community) ?? community;
          return (
            <li key={community} className="share-row">
              <Link href={`/c/${community}`} className="row-name truncate font-medium">
                {name}
              </Link>
              <div className="row-plot tier-bar">
                {shares.map((s, i) =>
                  s > 0 ? (
                    <span
                      key={i}
                      tabIndex={0}
                      className={`tier-seg tier-${levels[i]} tip ${i >= 2 ? "tip-end" : "tip-start"}`}
                      style={{ width: `${s * 100}%` }}
                      aria-label={`${name}: ${Math.round(s * teams)} teams in ${label(levels[i]!)}`}
                    >
                      <Tip
                        title={`${name}, ${label(levels[i]!)}`}
                        lines={[`${Math.round(s * teams)} of ${teams} teams (${percent(s)})`]}
                      />
                    </span>
                  ) : null,
                )}
              </div>
              <span className="row-value muted text-right text-xs tabular-nums">{teams}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-4 flex flex-wrap gap-x-3 gap-y-1 text-xs">
        {levels.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className={`heat-swatch tier-${t}`} aria-hidden="true" />
            {label(t)}
          </span>
        ))}
        <span className="muted">Right column: teams</span>
      </div>
    </figure>
  );
}
