import { type TableRow, teamLabel } from "@/lib/view";

/** A league table; rows for `highlight`'s teams are marked. */
export function StandingsTable({
  rows,
  age,
  highlight,
}: {
  rows: TableRow[];
  age: string | null;
  highlight?: (row: TableRow) => boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="standings">
        <thead>
          <tr>
            <th scope="col">#</th>
            <th scope="col" className="team">
              Team
            </th>
            <th scope="col" title="Games played">
              GP
            </th>
            <th scope="col" title="Wins">
              W
            </th>
            <th scope="col" title="Losses">
              L
            </th>
            <th scope="col" title="Ties">
              T
            </th>
            <th scope="col" title="Points">
              PTS
            </th>
            <th scope="col" title="Goals for">
              GF
            </th>
            <th scope="col" title="Goals against">
              GA
            </th>
            <th scope="col" title="Goal differential">
              +/-
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.team.id} className={highlight?.(r) ? "mine" : undefined}>
              <td>{r.rank}</td>
              <td className="team">{teamLabel(r.team.name, age)}</td>
              <td>{r.gp}</td>
              <td>{r.w}</td>
              <td>{r.l}</td>
              <td>{r.t}</td>
              <td className="font-semibold">{r.pts}</td>
              <td>{r.gf}</td>
              <td>{r.ga}</td>
              <td>{r.diff > 0 ? `+${r.diff}` : r.diff}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
