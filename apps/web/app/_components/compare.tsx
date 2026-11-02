// The home page's community comparison: ranked share bars, an age heatmap and,
// once tiers come out of seeding, where each community's teams were placed.
// Server-rendered HTML and CSS only; tooltips are CSS, shown on hover and on
// focus, and every value they hold is also printed or in the heatmap.
import type { CommunityComparison, ShareRecord } from "@hockey/core";
import Link from "next/link";
import {
  BAR_MAX,
  BAR_MIN,
  SHARE_BINS,
  THIN_GAMES,
  barPosition,
  perGame,
  percent,
  shareStep,
} from "@/lib/compare";

type Names = Map<string, string>;

const stepClass = (step: number) => (step < 0 ? `sn${-step}` : step > 0 ? `sp${step}` : "s0");

function recordLine(r: ShareRecord): string {
  return `${r.w}-${r.l}-${r.t} in ${r.gp} ${r.gp === 1 ? "game" : "games"} · ${perGame(r.gf - r.ga, r.gp)} goals a game`;
}

function Tip({ title, lines }: { title: string; lines: string[] }) {
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

export function AgeHeatmap({
  rows,
  ages,
  names,
}: {
  rows: CommunityComparison[];
  ages: string[];
  names: Names;
}) {
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
        className={`heat-cell tip ${end(i) ? "tip-end" : "tip-start"} ${stepClass(shareStep(r.share))}${thin ? " thin" : ""}`}
        aria-label={`${name} ${label}: ${percent(r.share)}, ${r.gp} games`}
      >
        {Math.round(r.share * 100)}
        <Tip
          title={`${name} ${label}: ${percent(r.share)}`}
          lines={[
            recordLine(r),
            ...(thin ? [`Fewer than ${THIN_GAMES} games: a small sample`] : []),
          ]}
        />
      </td>
    );
  };

  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">By age group</h2>
        <p className="muted mt-0.5 text-sm">
          Points share in each age, same order as above. A row that stays one colour is a pattern
          across the whole community, not one strong team.
        </p>
      </figcaption>
      <table className="heat mt-4">
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
          <span className="muted">Below even</span>
          <span className="flex gap-0.5" aria-hidden="true">
            {SHARE_BINS.map((b) => (
              <span key={b.step} className={`heat-swatch ${stepClass(b.step)}`} title={b.label} />
            ))}
          </span>
          <span className="muted">Above even</span>
        </div>
        <span className="muted">
          Faded: fewer than {THIN_GAMES} games. Classes: {SHARE_BINS.map((b) => b.label).join(", ")}
          .
        </span>
      </div>
    </figure>
  );
}

export function TierPlacement({
  rows,
  names,
  tiers,
}: {
  rows: { community: string; teams: number; shares: number[] }[];
  names: Names;
  tiers: number;
}) {
  const tierList = Array.from({ length: tiers }, (_, i) => i + 1);
  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">Where teams were placed</h2>
        <p className="muted mt-0.5 text-sm">
          Each community&apos;s tiered teams by tier, from seeding. More dark blue means more teams
          at the top. U15 and U18 stop at Tier 4.
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
                      className={`tier-seg tier-${i + 1} tip ${i >= 2 ? "tip-end" : "tip-start"}`}
                      style={{ width: `${s * 100}%` }}
                      aria-label={`${name}: ${Math.round(s * teams)} teams in Tier ${i + 1}`}
                    >
                      <Tip
                        title={`${name}, Tier ${i + 1}`}
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
        {tierList.map((t) => (
          <span key={t} className="flex items-center gap-1">
            <span className={`heat-swatch tier-${t}`} aria-hidden="true" />
            Tier {t}
          </span>
        ))}
        <span className="muted">Right column: teams</span>
      </div>
    </figure>
  );
}
