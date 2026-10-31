/**
 * The associations that enter Community Council teams, and how their team
 * names are read. Every source names teams the same way, more or less:
 *
 *   "U15 Glenlake Hawks NBC 1"   age, association and nickname, stream, number
 *   "U11 Bow Valley Flames 1 Black"                    ... number, colour
 *   "U11 GHC Inferno Blaze"      Girls Hockey Calgary names teams, not numbers
 *   "Southwest 2 Gold"           the old history, with no age prefix
 *
 * No community is special: the app shows any of them the same way, and the
 * slug is the one in the URL (/c/glenlake).
 */

export interface Community {
  slug: string;
  name: string;
  /**
   * Prefixes a team name can start with, after its age. Matched longest
   * first, whole words only, ignoring case, so "McKnight" never matches
   * "Knights".
   */
  aliases: readonly string[];
}

// The 12 associations behind all 492 teams of 2026-27 seeding (TeamLinkt,
// captured 2026-10-31). "North West" and "NWCAA" are the old history's names.
export const COMMUNITIES: readonly Community[] = [
  { slug: "bow-river", name: "Bow River", aliases: ["Bow River Bruins", "Bow River"] },
  { slug: "bow-valley", name: "Bow Valley", aliases: ["Bow Valley Flames", "Bow Valley"] },
  {
    slug: "girls-hockey-calgary",
    name: "Girls Hockey Calgary",
    aliases: ["Girls Hockey Calgary", "GHC Inferno", "GHC"],
  },
  { slug: "glenlake", name: "Glenlake", aliases: ["Glenlake Hawks", "Glenlake"] },
  { slug: "knights", name: "Knights", aliases: ["Knights"] },
  { slug: "mcknight", name: "McKnight", aliases: ["McKnight Mustangs", "McKnight"] },
  {
    slug: "northwest",
    name: "Northwest",
    aliases: ["Northwest Warriors", "Northwest", "North West", "NWCAA"],
  },
  { slug: "raiders", name: "Raiders", aliases: ["Raiders Hockey Club", "Raiders"] },
  { slug: "southwest", name: "Southwest", aliases: ["Southwest", "South West"] },
  { slug: "springbank", name: "Springbank", aliases: ["Springbank Rockies", "Springbank"] },
  { slug: "trails-west", name: "Trails West", aliases: ["Trails West Wolves", "Trails West"] },
  { slug: "wolverines", name: "Wolverines", aliases: ["Wolverines"] },
];

const COLOURS = new Set(
  "red blue white black gold silver green yellow grey gray orange teal navy maroon purple".split(
    " ",
  ),
);

export interface ParsedTeamName {
  /** "U13", or null when the name has no age prefix. */
  age: string | null;
  /** Null when no alias matches: a new association or a renamed team. */
  community: Community | null;
  /** BC (body checking) or NBC, which U15 and U18 names carry. */
  stream: "BC" | "NBC" | null;
  number: number | null;
  /** Title case: "Gold". */
  colour: string | null;
  /** What is left after the alias and the parts above: "Blaze" for "GHC Inferno Blaze". */
  rest: string;
}

// Longest alias first, so "Raiders Hockey Club" wins over "Raiders".
const ALIASES = COMMUNITIES.flatMap((c) =>
  c.aliases.map((alias) => ({ alias: alias.toLowerCase(), community: c })),
).sort((a, b) => b.alias.length - a.alias.length);

export function parseTeamName(name: string): ParsedTeamName {
  let text = name.trim().replace(/\s+/g, " ");
  const age = /^U\d+\b/i.exec(text)?.[0].toUpperCase() ?? null;
  if (age) text = text.slice(age.length).trim();

  const lower = text.toLowerCase();
  const hit = ALIASES.find(
    ({ alias }) =>
      lower.startsWith(alias) && (lower.length === alias.length || lower[alias.length] === " "),
  );
  const tokens = (hit ? text.slice(hit.alias.length) : text).split(" ").filter(Boolean);

  let colour: string | null = null;
  let number: number | null = null;
  let stream: ParsedTeamName["stream"] = null;
  const last = () => tokens[tokens.length - 1] ?? "";
  if (COLOURS.has(last().toLowerCase())) {
    const c = tokens.pop()!.toLowerCase();
    colour = c[0]!.toUpperCase() + c.slice(1);
  }
  if (/^#?\d+$/.test(last())) number = Number(tokens.pop()!.replace("#", ""));
  const s = tokens.findIndex((t) => /^n?bc$/i.test(t));
  if (s >= 0) stream = tokens.splice(s, 1)[0]!.toUpperCase() as "BC" | "NBC";

  return { age, community: hit?.community ?? null, stream, number, colour, rest: tokens.join(" ") };
}

export function communityBySlug(slug: string): Community | undefined {
  return COMMUNITIES.find((c) => c.slug === slug);
}
