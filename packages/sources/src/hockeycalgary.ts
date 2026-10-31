/**
 * hockeycalgary.ca pages that robots.txt allows. So far, the stream index
 * that lists every league in a stream: for Community Council, the 59 leagues
 * from U7 to Junior C. It is the authority on which TeamLinkt divisions are
 * Community Council leagues, since TeamLinkt lists every stream together.
 */

export const HOCKEY_CALGARY_ORIGIN = "https://www.hockeycalgary.ca";
export const COMMUNITY_COUNCIL = "community-council";

export class HockeyCalgaryShapeError extends Error {
  constructor(page: string, detail: string) {
    super(`Hockey Calgary ${page} page changed shape: ${detail}`);
    this.name = "HockeyCalgaryShapeError";
  }
}

export interface HcLeague {
  slug: string;
  name: string;
  stream: string;
  url: string;
}

export function leagueIndexUrl(stream = COMMUNITY_COUNCIL): string {
  return `${HOCKEY_CALGARY_ORIGIN}/stream/view/stream/${stream}`;
}

/**
 * The league links in the index's "Find Your League" table. Throws when it
 * finds none, so a redesign of the page fails loudly instead of emptying the
 * league list.
 */
export function parseLeagueIndex(html: string, stream = COMMUNITY_COUNCIL): HcLeague[] {
  const link = new RegExp(
    `<a href="/league/view/stream/${stream}/league/([a-z0-9-]+)">([^<]+)</a>`,
    "g",
  );
  const leagues = new Map<string, HcLeague>();
  for (const [, slug, text] of html.matchAll(link)) {
    leagues.set(slug!, {
      slug: slug!,
      name: decodeEntities(text!).trim(),
      stream,
      url: `${HOCKEY_CALGARY_ORIGIN}/league/view/stream/${stream}/league/${slug}`,
    });
  }
  if (leagues.size === 0) throw new HockeyCalgaryShapeError("league index", "no league links");
  return [...leagues.values()];
}

// Hockey Calgary and TeamLinkt share league slugs, with this one exception.
const TEAMLINKT_SLUGS: Record<string, string> = { "junior-c": "u21-junior-c" };

export function teamLinktSlug(hcSlug: string): string {
  return TEAMLINKT_SLUGS[hcSlug] ?? hcSlug;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;/g, " ");
}
