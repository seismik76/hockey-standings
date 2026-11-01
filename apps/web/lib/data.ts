// The pages' only way to the database. `next build` never needs one: `/` and
// /leagues render per request (force-dynamic), and the community and league
// pages are ISR with an empty generateStaticParams, so each renders on its first
// visit and is then served from cache, re-rendered in the background at most
// every five minutes. The collector writes four times a day, so the cache adds at
// most five minutes to how old a score can be.
//
// The helpers below are wrapped in React's cache() so generateMetadata and the
// page share one set of queries per render.
import { cache } from "react";
import { communityName, currentSeason, getDb } from "@hockey/db";

export { getDb };

export const seasonOrNull = cache(async (): Promise<string | null> => currentSeason(getDb()));

export const nameOfCommunity = cache(async (slug: string): Promise<string | null> =>
  communityName(getDb(), slug),
);
