// Liveness and readiness probe. Touches no database, so a Neon cold start or
// outage never gets replicas killed; the pages report those themselves.
// `build` is the commit the image was built from, so CI can tell when a deploy
// has landed. The repo is public, so the commit is no secret.
export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json(
    { data: { status: "ok", build: process.env.GIT_SHA || "dev" } },
    { headers: { "cache-control": "no-store" } },
  );
}
