/* The GLUE Cloud Worker (ADR 0036): API + the per-user signaling rooms. */
import { handle, type Env } from './api';
import { purge } from './shared';
import { googleKeys } from './crypto';
export { Signal } from './signal';

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env, { now: () => Date.now(), googleKeys: () => googleKeys() });
  },
  // Daily (wrangler.toml): the account copies whose cloud sync was turned off 30 days ago go (ADR 0102).
  async scheduled(_e: unknown, env: Env): Promise<void> { await purge(env, Date.now()); },
};
