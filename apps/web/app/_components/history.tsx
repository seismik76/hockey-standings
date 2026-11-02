// The past-seasons page: each community's points share season by season, and
// one small age-by-season grid per community, where an age group can be
// followed down the diagonal. Same classes, colours and CSS tooltips as the
// home page's heatmaps (compare.tsx).
import type { CommunityHistory, ShareRecord } from "@hockey/core";
import Link from "next/link";
import { Tip, recordLine, stepClass } from "@/app/_components/compare";
import { SHARE_BINS, THIN_GAMES, percent, seasonShort, shareStep } from "@/lib/compare";

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

export function AgeGroupGrids({
  rows,
  seasons,
  ages,
  current,
  names,
}: {
  rows: CommunityHistory[];
  seasons: string[];
  ages: string[];
  current: string | null;
  names: Names;
}) {
  const end = (i: number) => i >= Math.floor(seasons.length / 2);
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">Follow an age group</h2>
      <p className="muted mt-1 text-sm">
        Each age band is two birth years, so the same players move down one row every two seasons:
        read down the diagonal. Before this season there is no U9, and no U11 before 2024-25.
      </p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {rows.map(({ community, byAge }) => {
          const name = names.get(community) ?? community;
          return (
            <figure key={community} className="card p-3">
              <figcaption className="font-semibold">
                <Link href={`/c/${community}`}>{name}</Link>
              </figcaption>
              <table className="heat heat-mini mt-2">
                <thead>
                  <tr>
                    <th scope="col" className="heat-name">
                      <span className="sr-only">Age</span>
                    </th>
                    {seasons.map((s) => (
                      <th key={s} scope="col">
                        {seasonShort(s)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {ages.map((age) => (
                    <tr key={age}>
                      <th scope="row" className="heat-name">
                        {age}
                      </th>
                      {seasons.map((s, i) => (
                        <Cell
                          key={s}
                          r={byAge.get(age)?.get(s)}
                          title={`${name} ${age}, ${s}`}
                          current={s === current}
                          end={end(i)}
                        />
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </figure>
          );
        })}
      </div>
      <Legend />
    </section>
  );
}
