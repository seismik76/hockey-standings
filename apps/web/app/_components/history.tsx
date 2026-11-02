// The past-seasons page: each community's points share season by season, and
// one birth year followed through its age bands, community against community. Same classes, colours and CSS tooltips as the
// home page's heatmaps (compare.tsx).
import type { CommunityHistory, ShareRecord } from "@hockey/core";
import Link from "next/link";
import { Tip, recordLine, stepClass } from "@/app/_components/compare";
import {
  SHARE_BINS,
  THIN_GAMES,
  bandFor,
  bandLabel,
  percent,
  seasonShort,
  shareStep,
} from "@/lib/compare";

type Names = Map<string, string>;

function Cell({
  r,
  title,
  current,
  end,
}: {
  r: ShareRecord | undefined;
  title: string;
  current: boolean;
  end: boolean;
}) {
  if (!r || r.gp === 0) return <td className="heat-empty">–</td>;
  const thin = r.gp < THIN_GAMES;
  return (
    <td
      tabIndex={0}
      className={`heat-cell tip ${end ? "tip-end" : "tip-start"} ${stepClass(shareStep(r.share))}${thin ? " thin" : ""}`}
      aria-label={`${title}: ${percent(r.share)}, ${r.gp} games`}
    >
      {Math.round(r.share * 100)}
      <Tip
        title={`${title}: ${percent(r.share)}`}
        lines={[
          recordLine(r),
          ...(current ? ["This season so far"] : []),
          ...(thin ? [`Fewer than ${THIN_GAMES} games: a small sample`] : []),
        ]}
      />
    </td>
  );
}

function Legend() {
  return (
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
        Faded: fewer than {THIN_GAMES} games. Classes: {SHARE_BINS.map((b) => b.label).join(", ")}.
      </span>
    </div>
  );
}

export function SeasonHeatmap({
  rows,
  seasons,
  current,
  names,
}: {
  rows: CommunityHistory[];
  seasons: string[];
  current: string | null;
  names: Names;
}) {
  const end = (i: number) => i >= Math.floor((seasons.length + 1) / 2);
  return (
    <figure className="card mt-5 p-4">
      <figcaption>
        <h2 className="font-semibold">Points share by season</h2>
        <p className="muted mt-0.5 text-sm">
          All ages together, against same-level teams. Best overall first.
          {current && <> {seasonShort(current)} is this season so far.</>}
        </p>
      </figcaption>
      <table className="heat heat-seasons mt-4">
        <thead>
          <tr>
            <th scope="col" className="heat-name">
              <span className="sr-only">Community</span>
            </th>
            {seasons.map((s) => (
              <th key={s} scope="col">
                {seasonShort(s)}
              </th>
            ))}
            <th scope="col">All</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ community, all, bySeason }) => {
            const name = names.get(community) ?? community;
            return (
              <tr key={community}>
                <th scope="row" className="heat-name">
                  <Link href={`/c/${community}`}>{name}</Link>
                </th>
                {seasons.map((s, i) => (
                  <Cell
                    key={s}
                    r={bySeason.get(s)}
                    title={`${name} ${s}`}
                    current={s === current}
                    end={end(i)}
                  />
                ))}
                <Cell r={all} title={`${name}, every season`} current={false} end />
              </tr>
            );
          })}
        </tbody>
      </table>
      <Legend />
    </figure>
  );
}

export function BirthYearGrid({
  rows,
  seasons,
  born,
  years,
  hrefFor,
  current,
  names,
}: {
  rows: { community: string; cells: Map<string, ShareRecord>; all: ShareRecord }[];
  /** The seasons this birth year has data in, oldest first. */
  seasons: string[];
  born: number;
  /** Every birth year there is something for, for the picker. */
  years: number[];
  hrefFor: (born: number) => string;
  current: string | null;
  names: Names;
}) {
  const end = (i: number) => i >= Math.floor((seasons.length + 1) / 2);
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Follow a birth year</h2>
      <p className="muted mt-1 text-sm">
        The same kids, season by season, community against community. Bands go by age on December
        31: U9 is 7 and 8, U11 9 and 10, up to U18 at 15 to 17.
      </p>
      <nav className="mt-3 flex flex-wrap gap-1.5" aria-label="Birth year">
        {years.map((y) => (
          <Link
            key={y}
            href={hrefFor(y)}
            aria-current={y === born ? "page" : undefined}
            className="year-chip"
          >
            {y}
          </Link>
        ))}
      </nav>
      <figure className="card mt-4 p-4">
        <figcaption>
          <h3 className="font-semibold">Born {born}</h3>
          <p className="muted mt-0.5 text-sm">
            Each season shows the band this birth year played in. A band holds two birth years (U18
            three) and teams mix them, so a number is shared with the birth year beside it. Best
            overall for {born} first.
          </p>
        </figcaption>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm">No games for this birth year yet.</p>
        ) : (
          <table className="heat heat-seasons mt-4">
            <thead>
              <tr>
                <th scope="col" className="heat-name">
                  <span className="sr-only">Community</span>
                </th>
                {seasons.map((s) => {
                  const band = bandFor(born, s)!;
                  return (
                    <th key={s} scope="col">
                      <span className="block">{seasonShort(s)}</span>
                      <span className="band-head block">{band.age}</span>
                      <span className="band-head block">
                        {["1st", "2nd", "3rd"][band.year - 1]} yr
                      </span>
                    </th>
                  );
                })}
                <th scope="col">All</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ community, cells, all }) => {
                const name = names.get(community) ?? community;
                return (
                  <tr key={community}>
                    <th scope="row" className="heat-name">
                      <Link href={`/c/${community}`}>{name}</Link>
                    </th>
                    {seasons.map((s, i) => (
                      <Cell
                        key={s}
                        r={cells.get(s)}
                        title={`${name}, born ${born}, ${s} (${bandLabel(bandFor(born, s)!)})`}
                        current={s === current}
                        end={end(i)}
                      />
                    ))}
                    <Cell
                      r={all}
                      title={`${name}, born ${born}, every season`}
                      current={false}
                      end
                    />
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <Legend />
      </figure>
    </section>
  );
}
