// The collector's only way out to the network. Every request identifies the
// app, waits its turn, and is logged to `fetches` whether it worked or not.
import { createHash } from "node:crypto";
import { type Database, recordFetch } from "@hockey/db";

export const USER_AGENT = "hockey-standings/0.1 (+https://github.com/seismik76/hockey-standings)";

export type Source = "teamlinkt" | "hockeycalgary";

export interface HttpRequest {
  source: Source;
  method: "GET" | "POST";
  url: string;
  body?: Record<string, unknown>;
}

export interface HttpResponse {
  status: number;
  text: string;
}

/** What actually sends a request. Tests swap in one that serves fixtures. */
export type Transport = (req: HttpRequest) => Promise<HttpResponse>;

export const fetchTransport: Transport = async (req) => {
  const res = await fetch(req.url, {
    method: req.method,
    headers: {
      "User-Agent": USER_AGENT,
      Accept: req.source === "teamlinkt" ? "application/json" : "text/html",
      ...(req.body ? { "Content-Type": "application/json" } : {}),
    },
    ...(req.body ? { body: JSON.stringify(req.body) } : {}),
    // A redirect here is TeamLinkt refusing the request, not a page moving.
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  return { status: res.status, text: await res.text() };
};

export class HttpError extends Error {
  constructor(
    readonly req: HttpRequest,
    readonly status: number,
  ) {
    super(`${req.method} ${req.url} answered ${status}`);
    this.name = "HttpError";
  }
}

export interface Client {
  /** Sends the request and parses the body; `parse` returns the result and how many records it held. */
  request<T>(req: HttpRequest, parse: (text: string) => { value: T; records: number }): Promise<T>;
  readonly count: number;
}

/**
 * At most one request in flight, `gapMs` apart: about one a second by
 * default. One retry after a network error or a 5xx; anything else fails.
 */
export function createClient(
  db: Database,
  transport: Transport,
  { gapMs = 1000 }: { gapMs?: number } = {},
): Client {
  let last = 0;
  let count = 0;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  async function once(req: HttpRequest): Promise<HttpResponse> {
    const ready = last + gapMs - Date.now();
    if (ready > 0) await wait(ready);
    last = Date.now();
    count++;
    return transport(req);
  }

  return {
    get count() {
      return count;
    },
    async request(req, parse) {
      const started = Date.now();
      let status: number | undefined;
      let text: string | undefined;
      try {
        let res: HttpResponse;
        try {
          res = await once(req);
          if (res.status >= 500) throw new HttpError(req, res.status);
        } catch {
          await wait(gapMs * 5);
          res = await once(req);
        }
        status = res.status;
        text = res.text;
        if (status < 200 || status >= 300) throw new HttpError(req, status);
        const { value, records } = parse(text);
        await log(db, req, { started, status, text, records });
        return value;
      } catch (err) {
        await log(db, req, { started, status, text, error: String(err) });
        throw err;
      }
    },
  };
}

async function log(
  db: Database,
  req: HttpRequest,
  r: {
    started: number;
    status?: number | undefined;
    text?: string | undefined;
    records?: number;
    error?: string;
  },
): Promise<void> {
  await recordFetch(db, {
    source: req.source,
    method: req.method,
    url: req.url,
    body: req.body ?? null,
    status: r.status ?? null,
    durationMs: Date.now() - r.started,
    contentHash: r.text === undefined ? null : createHash("sha256").update(r.text).digest("hex"),
    records: r.records ?? null,
    error: r.error ?? null,
  });
}
