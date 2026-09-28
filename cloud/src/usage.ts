/* Free-tier usage for the admin panel (ADR 0093): how much of Cloudflare's free plan GLUE Cloud uses.
   From Cloudflare's GraphQL Analytics API, with a read-only token (secret CF_ANALYTICS_TOKEN, "Account
   Analytics: Read") and the account's id (CF_ACCOUNT_ID). Without them: only what the database says of
   itself. The limits are Cloudflare's published free-plan numbers [UNVERIFIED: check them before relying
   on them for other users]. */

export interface UsageEnv { CF_ANALYTICS_TOKEN?: string; CF_ACCOUNT_ID?: string }

export const LIMITS = {
  d1Storage: 5e9,          // bytes, all databases of the account
  d1RowsRead: 5_000_000,   // per day
  d1RowsWritten: 100_000,  // per day
  workerRequests: 100_000, // per day
  turnEgress: 1e12,        // bytes per month (1,000 GB)
};

export interface Usage {
  at: number;
  d1: { bytes: number | null; rowsRead: number | null; rowsWritten: number | null };
  worker: { requests: number | null; errors: number | null };
  turn: { egressBytes: number | null; ingressBytes: number | null };
  limits: typeof LIMITS;
  /** Why some numbers are missing (no token yet, or the API said no). */
  note?: string;
}

const QUERY = `query($a: String!, $day: Date!, $month: Date!) { viewer { accounts(filter: { accountTag: $a }) {
  d1: d1AnalyticsAdaptiveGroups(limit: 100, filter: { date_geq: $day }) { sum { rowsRead rowsWritten } }
  size: d1StorageAdaptiveGroups(limit: 100, filter: { date_geq: $day }) { max { databaseSizeBytes } dimensions { databaseId } }
  worker: workersInvocationsAdaptive(limit: 100, filter: { date_geq: $day }) { sum { requests errors } }
  turn: callsTurnUsageAdaptiveGroups(limit: 100, filter: { date_geq: $month }) { sum { egressBytes ingressBytes } }
} } }`;

type Groups = { d1?: { sum: { rowsRead: number; rowsWritten: number } }[]; size?: { max: { databaseSizeBytes: number } }[]; worker?: { sum: { requests: number; errors: number } }[]; turn?: { sum: { egressBytes: number; ingressBytes: number } }[] };
const total = <T>(xs: T[] | undefined, f: (x: T) => number) => xs ? xs.reduce((a, x) => a + (f(x) || 0), 0) : null;

/** `dbBytes`: the database's own size (a query's meta), used when the analytics API isn't reachable. */
export async function usage(env: UsageEnv, ask: typeof fetch, now: number, dbBytes: number | null): Promise<Usage> {
  const out: Usage = { at: now, d1: { bytes: dbBytes, rowsRead: null, rowsWritten: null }, worker: { requests: null, errors: null }, turn: { egressBytes: null, ingressBytes: null }, limits: LIMITS };
  if (!env.CF_ANALYTICS_TOKEN || !env.CF_ACCOUNT_ID) return { ...out, note: 'Add a read-only Cloudflare token (CF_ANALYTICS_TOKEN) to see the daily and monthly numbers.' };
  const d = new Date(now), day = d.toISOString().slice(0, 10), month = day.slice(0, 8) + '01';
  try {
    const r = await ask('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST', headers: { Authorization: 'Bearer ' + env.CF_ANALYTICS_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: QUERY, variables: { a: env.CF_ACCOUNT_ID, day, month } }),
    });
    const j = await r.json() as { data?: { viewer?: { accounts?: Groups[] } }; errors?: { message: string }[] | null };
    if (!r.ok || j.errors?.length) return { ...out, note: 'Cloudflare’s analytics said: ' + (j.errors?.[0]?.message ?? r.status) };
    const g = j.data?.viewer?.accounts?.[0] ?? {};
    return {
      ...out,
      d1: { bytes: total(g.size, x => x.max.databaseSizeBytes) ?? dbBytes, rowsRead: total(g.d1, x => x.sum.rowsRead), rowsWritten: total(g.d1, x => x.sum.rowsWritten) },
      worker: { requests: total(g.worker, x => x.sum.requests), errors: total(g.worker, x => x.sum.errors) },
      turn: { egressBytes: total(g.turn, x => x.sum.egressBytes), ingressBytes: total(g.turn, x => x.sum.ingressBytes) },
    };
  } catch (e) { return { ...out, note: 'Cloudflare’s analytics didn’t answer: ' + (e as Error).message }; }
}
