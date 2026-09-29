/* GLUE Cloud's limits and its error (shared by the routes). */

export const MAX_FILE = 1_800_000;        // base64 characters per file (D1 rows are at most 2 MB)
/** A download answer: characters and paths. */
export const MAX_BUNDLE = 1_500_000, MAX_BUNDLE_PATHS = 2000;
/** Stored per user (base64), by tier (ADR 0041). Everyone is on paid for now. */
export const MAX_BYTES: Record<string, number> = { free: 50_000_000, paid: 300_000_000, admin: 1_000_000_000 };

export class SyncError extends Error { constructor(readonly status: number, msg: string) { super(msg); } }
