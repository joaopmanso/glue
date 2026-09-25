/* The GLUE Cloud Worker (ADR 0036): API + the per-user signaling rooms. */
import { handle, type Env } from './api';
import { googleKeys } from './crypto';
export { Signal } from './signal';

export default {
  fetch(req: Request, env: Env): Promise<Response> {
    return handle(req, env, { now: () => Date.now(), googleKeys: () => googleKeys() });
  },
};
