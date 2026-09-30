/* Which computer GLUE Home is on (ADR 0108): the account's device a computer's shared parts go under (its
   copies of the songs, its analyses, its music folders), the same one a GLUE tab here is. From GLUE Cloud:
   GLUE Home's companion. Failing that, from what's on this disk: the member of this GLUE folder's shared
   collections whose music folders GLUE Home found here, which GLUE Home then vouches for (it becomes its
   companion). Failing that, the next GLUE tab here that attaches (ADR 0091). Until it's known, GLUE Home writes
   none of a shared collection's per-computer parts. */
import { access } from './cloud';
import { bridge, type HomeConfig } from './bridge';
import { describe } from './library';
import { unknownComputer, type SharedCollection } from '../../src/core/shared/project';

export interface Identity { computer: string | null; why: string }

/** The members of this GLUE folder's shared collections whose (non-hidden) music folders GLUE Home found on
    this computer. */
export async function computersHere(cfg: HomeConfig): Promise<string[]> {
  const lib = await describe(), found = new Set(Object.keys(cfg.folders ?? {})), out = new Set<string>();
  for (const p of lib?.profiles ?? []) for (const c of p.collections) {
    let meta: SharedCollection | null = null;
    try { meta = JSON.parse(await bridge.glueRead(`profiles/${p.id}/collections/${c.id}/collection.json`)); } catch { continue; }
    if (!meta?.shared || (meta as { movedTo?: string }).movedTo) continue;
    for (const [m, roots] of Object.entries(meta.rootsBy ?? {})) if (!unknownComputer(m) && (roots ?? []).some(r => !r.hidden && found.has(r.id))) out.add(m);
  }
  return [...out].sort();
}

export async function whoAmI(cfg: HomeConfig, api: string, f: typeof fetch = fetch): Promise<Identity> {
  if (!cfg.deviceId || !cfg.token) return { computer: null, why: 'not connected to a GLUE account' };
  const t = await access(api, cfg.deviceId, cfg.token, f);
  const ask = (path: string, init: RequestInit = {}) => f(api + path, { ...init, headers: { ...(init.headers ?? {}), Authorization: 'Bearer ' + t } });
  const r = await ask('/v1/computer');
  const cloud = r.ok ? ((await r.json()) as { computer?: string | null }).computer ?? null : null;
  const here = await computersHere(cfg).catch(() => [] as string[]);
  if (cloud) {
    // GLUE Cloud and this disk disagree: nothing is written until they don't.
    if (here.length && !here.includes(cloud)) return { computer: null, why: 'GLUE Cloud says this computer is “' + cloud + '”, but its music folders are another computer’s (' + here.join(', ') + ')' };
    return { computer: cloud, why: 'GLUE Cloud' };
  }
  if (here.length === 1) {
    // Vouched for: it becomes this GLUE Home's companion (ADR 0091).
    const a = await ask('/v1/computer/attach', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ browser: here[0] }) });
    const j = a.ok ? await a.json() as { device?: string } : null;
    if (j?.device) return { computer: j.device, why: 'its music folders' };
    return { computer: null, why: 'GLUE Cloud didn’t confirm the computer its music folders show (' + a.status + ')' };
  }
  return { computer: null, why: here.length > 1 ? 'its music folders belong to several computers (' + here.join(', ') + ')' : 'a GLUE tab on this computer hasn’t attached yet' };
}
