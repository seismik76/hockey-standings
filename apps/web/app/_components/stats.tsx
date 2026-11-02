// The stats page: scoring depth by community and age (the thin-talent test),
// leaderboards, and every player line of a league. Anonymous throughout: a
// line is "a player on this team", shown with a rank and the team, never a
// name, number or photo. Same classes, colours and CSS tooltips as the home
// page's heatmaps.
import type { Depth, DepthTable } from "@hockey/core";
import type { PlayerLine } from "@hockey/db";
import Link from "next/link";
import { Tip, stepClass } from "@/app/_components/compare";
import { DEPTH_BINS, depthStep, percent } from "@/lib/compare";
import { teamLabel } from "@/lib/view";

type Names = Map<string, string>;

const METRICS = {
  scorers: {
    title: "Skaters who have scored",
    caption:
      "Share of each community's skaters with at least one goal. Fewer scoring means fewer players who can finish.",
    value: (d: Depth) => d.scorerShare,
    higherIsDeeper: true,
    detail: (d: Depth) => `${d.scorers} of ${d.skaters} skaters on ${d.teams} teams`,
  },
  topTwo: {
    title: "Goals from each team's top two scorers",
    caption:
      "Share of a team's goals scored by its two best scorers, across the community's teams. Higher means leaning on fewer players.",
    value: (d: Depth) => d.topTwoShare,
    higherIsDeeper: false,
    detail: (d: Depth) => `${d.topTwo} of ${d.goals} goals on ${d.teams} teams`,
  },
} as const;

export function DepthHeatmap({
  table,
  rows,
  ages,
  names,
  metric,
}: {
  table: DepthTable;
  /** Communities, in display order. */
  rows: string[];
  ages: string[];
  names: Names;
  metric: keyof typeof METRICS;
}) {
  const m = METRICS[metric];
  const cols = [...ages, "all"];
  const end = (i: number) => i >= Math.floor(cols.length / 2);
  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h3 className="font-semibold">{m.title}</h3>
        <p className="muted mt-0.5 text-sm">
          {m.caption} Coloured against all communities at that age: blue deeper, red thinner.
        </p>
      </figcaption>
      <table className="heat heat-seasons mt-4">
        <thead>
          <tr>
            <th scope="col" className="heat-name">
              <span className="sr-only">Community</span>
            </th>
            {cols.map((a) => (
              <th key={a} scope="col">
                {a === "all" ? "All" : a}
              </th>
            ))}
          </tr>
          <tr>
            <th scope="row" className="heat-name muted">
              Everyone
            </th>
            {cols.map((a) => {
              const c = table.city.get(a);
              return (
                <th key={a} scope="col" className="muted">
                  {c ? Math.round(m.value(c) * 100) : "–"}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((community) => {
            const name = names.get(community) ?? community;
            const byAge = table.byCommunity.get(community);
            return (
              <tr key={community}>
                <th scope="row" className="heat-name">
                  <Link href={`/c/${community}`}>{name}</Link>
                </th>
                {cols.map((a, i) => {
                  const d = byAge?.get(a);
                  const c = table.city.get(a);
                  if (!d || !c || d.teams === 0) {
                    return (
                      <td key={a} className="heat-empty">
                        –
                      </td>
                    );
                  }
                  const v = m.value(d);
                  const label = a === "all" ? "all ages" : a;
                  return (
                    <td
                      key={a}
                      tabIndex={0}
                      className={`heat-cell tip ${end(i) ? "tip-end" : "tip-start"} ${stepClass(depthStep(v, m.value(c), m.higherIsDeeper))}${d.teams < 3 ? " thin" : ""}`}
                      aria-label={`${name} ${label}: ${percent(v)}`}
                    >
                      {Math.round(v * 100)}
                      <Tip
                        title={`${name} ${label}: ${percent(v)}`}
                        lines={[
                          m.detail(d),
                          `Everyone at ${label}: ${percent(m.value(c))}`,
                          ...(d.teams < 3 ? ["Fewer than 3 teams: a small sample"] : []),
                        ]}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs">
        <div className="flex items-center gap-1.5">
          <span className="muted">Thinner</span>
          <span className="flex gap-0.5" aria-hidden="true">
            {DEPTH_BINS.map((b) => (
              <span key={b.step} className={`heat-swatch ${stepClass(b.step)}`} title={b.label} />
            ))}
          </span>
          <span className="muted">Deeper</span>
        </div>
        <span className="muted">
          Points from everyone at that age: {DEPTH_BINS.map((b) => b.label).join(", ")}. Faded:
          fewer than 3 teams.
        </span>
      </div>
    </figure>
  );
}

function Team({ line }: { line: PlayerLine }) {
  return (
    <>
      <span className="sr-only">Player on </span>
      <Link href={`/l/${line.phase}/${line.leagueSlug}`}>{teamLabel(line.team, line.age)}</Link>
    </>
  );
}

export function SkaterTable({ lines, showAge }: { lines: PlayerLine[]; showAge: boolean }) {
  if (lines.length === 0) return <p className="muted mt-3 text-sm">No skater lines yet.</p>;
  return (
    <div className="table-wrap mt-3">
      <table className="standings">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="team">Skater</th>
            {showAge && <th>Age</th>}
            <th>GP</th>
            <th>G</th>
            <th>A</th>
            <th>PTS</th>
            <th>PIM</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i}>
              <td className="rank muted">{i + 1}</td>
              <td className="team">
                <Team line={l} />
              </td>
              {showAge && <td>{l.age}</td>}
              <td>{l.gp}</td>
              <td>{l.g}</td>
              <td>{l.a}</td>
              <td className="font-semibold">{l.g + l.a}</td>
              <td>{l.pim}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function GoalieTable({ lines, showAge }: { lines: PlayerLine[]; showAge: boolean }) {
  if (lines.length === 0) return <p className="muted mt-3 text-sm">No goalie lines yet.</p>;
  return (
    <div className="table-wrap mt-3">
      <table className="standings">
        <thead>
          <tr>
            <th className="rank">#</th>
            <th className="team">Goalie</th>
            {showAge && <th>Age</th>}
            <th>GP</th>
            <th>GA</th>
            <th>GA/GP</th>
            <th>SO</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => {
            const games = l.gp;
            return (
              <tr key={i}>
                <td className="rank muted">{i + 1}</td>
                <td className="team">
                  <Team line={l} />
                </td>
                {showAge && <td>{l.age}</td>}
                <td>{games}</td>
                <td>{l.goalsAgainst ?? 0}</td>
                <td className="font-semibold">
                  {games > 0 ? ((l.goalsAgainst ?? 0) / games).toFixed(2) : "–"}
                </td>
                <td>{l.shutouts ?? 0}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
