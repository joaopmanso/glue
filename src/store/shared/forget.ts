/* A collection deleted from the account on another device (ADR 0112): each device keeps a backup of the
   profile, then takes the collection out of the profile's list. Its files stay in the GLUE folder. Used by
   the tab and by GLUE Home. */
import type { HomeStore } from '../home';
import { buildBackup } from '../backup';
import { writeBlob } from '../fsx';

/** False: the profile didn't have it (forgotten already). */
export async function forgetDeleted(home: HomeStore, pid: string, cid: string, day = new Date().toISOString().slice(0, 10)): Promise<boolean> {
  const p = await home.loadProfile(pid);
  if (!p.collections.some(c => c.id === cid)) return false;
  await writeBlob(home.root, `backups/pre-deleted-${day}-${cid}.zip`, await buildBackup(home.root, p, { songs: false }));
  p.collections = p.collections.filter(c => c.id !== cid);
  if (p.lastCollection === cid) p.lastCollection = p.collections[0]?.id ?? null;
  await home.saveProfile(p);
  return true;
}
