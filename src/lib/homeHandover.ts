/* The website on a computer with GLUE Home hands its mini spectrograms, full analyses (ADR 0046) and
   covers (ADR 0082) and waveforms (ADR 0085) over to it, so GLUE Home can show them to the account's other devices without
   analysing every song again. Only what GLUE Home doesn't have yet; once per collection per visit, then
   new ones. */
import { account } from './account.svelte';
import { lib } from './library.svelte';
import { remoteFiles, companionOnline } from './remoteFiles.svelte';
import { localHome } from './localHome.svelte';
import { cacheDir } from '../platform';
import { readJSON } from '../store/fsx';
import { shardOf } from '../store/types';

let busy = false;
const done = new Set<string>();

async function bytesAt(dir: FileSystemDirectoryHandle, path: string): Promise<Uint8Array | null> {
  try {
    const parts = path.split('/'), name = parts.pop()!;
    let d = dir;
    for (const p of parts) d = await d.getDirectoryHandle(p);
    return new Uint8Array(await (await (await d.getFileHandle(name)).getFile()).arrayBuffer());
  } catch { return null; }
}

/** Hand over what this computer's GLUE Home doesn't have, for the open collection. */
export async function handOver() {
  const me = account.thisDevice, s = lib.store, p = lib.profile;
  const home = me ? companionOnline(me) : null;
  if (busy || !home || !s || !p || lib.cloud || lib.readOnly) return;
  const cid = s.meta.id, key = home.id + '/' + cid;
  busy = true;
  try {
    const dir = await cacheDir();
    if (!dir) return;
    const a = await remoteFiles.ask(home.id, { t: 'have', profile: p.id, collection: cid });
    // `art` (GLUE Home 0.15): the covers it keeps; an older one doesn't say, and isn't sent covers.
    // `waves` (0.17): an older GLUE Home doesn't keep waveforms, and isn't sent them.
    const have = a.data as { thumbs: string[]; details: string[]; art?: string[]; waves?: string[] };
    const thumbs = new Set(have.thumbs), details = new Set(have.details), art = have.art ? new Set(have.art) : null, waves = have.waves ? new Set(have.waves) : null;
    for (const t of lib.ownTracks()) {
      if (lib.store !== s) return;
      if (!thumbs.has(t.id)) {
        const b = await bytesAt(dir, `thumbs/${cid}/${shardOf(t.id)}/${t.id}.bin`);
        if (b) await remoteFiles.ask(home.id, { t: 'put', kind: 'thumb', profile: p.id, collection: cid, track: t.id, size: b.length }, { upload: b }).catch(() => {});
      }
      if (waves && !waves.has(t.id)) {
        const b = await bytesAt(dir, `wthumbs/${cid}/${shardOf(t.id)}/${t.id}.bin`);
        if (b) await remoteFiles.ask(home.id, { t: 'put', kind: 'wave', profile: p.id, collection: cid, track: t.id, size: b.length }, { upload: b }).catch(() => {});
      }
      if (!details.has(t.id)) {
        const base = `details/${cid}/${shardOf(t.id)}/${t.id}`;
        const header = await readJSON<unknown>(dir, base + '.json').catch(() => null), bin = header ? await bytesAt(dir, base + '.bin') : null;
        if (header && bin) await remoteFiles.ask(home.id, { t: 'put', kind: 'details', profile: p.id, collection: cid, track: t.id, size: bin.length, header }, { upload: bin }).catch(() => {});
      }
      // Its cover (ADR 0082), once per picture: both sizes.
      if (art && t.art && !art.has(t.art)) {
        art.add(t.art);
        for (const px of [64, 320] as const) {
          const b = await bytesAt(dir, `art/${cid}/${t.art}-${px}.jpg`);
          if (b) await remoteFiles.ask(home.id, { t: 'put', kind: 'art', profile: p.id, collection: cid, track: t.id, hash: t.art, px, size: b.length }, { upload: b }).catch(() => {});
        }
      }
    }
    done.add(key);
  } catch (e) { console.warn('GLUE Home: hand-over stopped', e); }
  finally { busy = false; }
}

// Now and then: when a collection is open here and this computer's GLUE Home is online.
if (typeof window !== 'undefined') setInterval(() => {
  const me = account.thisDevice, h = me ? companionOnline(me) : null, cid = lib.store?.meta.id;
  // The local link (ADR 0048): asked for once, over the account's channel.
  if (h && !localHome.for(h.id)) void localHome.learn(h.id, home => remoteFiles.ask(home, { t: 'local' }).then(a => a.data as { port: number; token: string | null }));
  if (h && cid && !done.has(h.id + '/' + cid)) void handOver();
}, 20_000);
/** After new analyses: hand them over too (next round). */
export function analysedMore() { const cid = lib.store?.meta.id; for (const k of [...done]) if (k.endsWith('/' + cid)) done.delete(k); }
