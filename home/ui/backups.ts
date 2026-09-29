/* The day's backups (ADR 0090) when no GLUE tab here makes them, through the local link. */
import { bridge, type HomeConfig } from './bridge';
import { describe } from './library';
import { HomeDisk } from '../../src/platform/homeDisk';
import { autoBackup } from '../../src/store/backup';
import type { Profile } from '../../src/store/types';

/** The day's backup of each profile (ADR 0090), when no GLUE tab here does it: through the local link. */
export async function backupDaily(cfg: HomeConfig | null): Promise<number> {
  if (!cfg?.glue || !cfg.localToken || await bridge.leaseHeld()) return 0;
  const port = await bridge.localPort(), lib = await describe();
  if (!port || !lib) return 0;
  const disk = new HomeDisk('http://127.0.0.1:' + port, cfg.localToken), roots = await disk.roots();
  if (!roots.glue) return 0;
  const glue = disk.dir(roots.glue);
  let made = 0;
  for (const p of lib.profiles) {
    const profile = JSON.parse(await bridge.glueRead(`profiles/${p.id}/profile.json`).catch(() => 'null')) as Profile | null;
    if (profile && await autoBackup(glue, profile)) made++;
  }
  return made;
}
