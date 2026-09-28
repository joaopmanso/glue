/* Covers looked up on public services (ADR 0086), for songs whose tags have none: Deezer, then iTunes,
   then MusicBrainz's Cover Art Archive, one lookup at a time and gently (MusicBrainz asks for at most
   one request a second). What's found is kept like any cover (`a/<hash>-<px>.jpg`); per album (or
   song) the result in `f/<key hash>.txt`: the cover's hash, '' when nothing matched (asked again
   after a month), or 'x' when the user said it was the wrong one (never again). Only the artist and
   album or title go out. */
import { bridge } from './bridge';
import { lookupKey, pick, searchUrl, SERVICES, type CoverQuery, type Service } from '../../src/core/library/coverSearch';
import { coverFromImage } from '../../src/workers/cover';
import * as cache from './cache';

const RETRY_AFTER = 30 * 86_400_000;
const GAP: Record<Service, number> = { deezer: 250, itunes: 400, musicbrainz: 1100 };
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
async function fKey(key: string) { return 'f/' + hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))).slice(0, 32) + '.txt'; }

/** What's known for this song's album: a cover hash, '' nothing (for now), 'x' refused, or undefined
    (not looked up yet, or long enough ago to look again). */
export async function known(q: CoverQuery): Promise<string | undefined> {
  const key = lookupKey(q);
  if (!key) return '';
  const b = await cache.cacheFile(await fKey(key));
  if (!b) return undefined;
  const [hash, at] = new TextDecoder().decode(b).split('\n');
  if (hash === '' && Date.now() - Number(at || 0) > RETRY_AFTER) return undefined;
  return hash;
}
async function remember(q: CoverQuery, hash: string) {
  const key = lookupKey(q);
  if (key) await bridge.cacheWrite(await fKey(key), new TextEncoder().encode(hash + '\n' + Date.now()));
}
/** The user said this album's found cover is wrong: not shown, and not looked for again. */
export async function refuse(q: CoverQuery) { await remember(q, 'x'); }

const queue: CoverQuery[] = [], queued = new Set<string>();
let running = false;
const last: Record<Service, number> = { deezer: 0, itunes: 0, musicbrainz: 0 };
export const counts = { looked: 0, found: 0 };

/** Look this song's album up soon (once, however many songs of it ask). */
export function want(q: CoverQuery) {
  const key = lookupKey(q);
  if (!key || queued.has(key)) return;
  queued.add(key);
  queue.push(q);
  void run();
}
async function run() {
  if (running) return;
  running = true;
  try {
    while (queue.length) {
      const q = queue.shift()!, key = lookupKey(q)!;
      try { if (await known(q) === undefined) await remember(q, await find(q)); }
      catch (e) { console.warn('GLUE Home: cover lookup failed', key, e); }
      finally { queued.delete(key); }
    }
  } finally { running = false; }
}
async function ask(service: Service, url: string): Promise<Uint8Array> {
  const wait = last[service] + GAP[service] - Date.now();
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  last[service] = Date.now();
  return new Uint8Array(await bridge.webGet(url));
}
/** Each service in turn; the first matching picture becomes the cover. */
async function find(q: CoverQuery): Promise<string> {
  counts.looked++;
  for (const s of SERVICES) {
    const url = searchUrl(s, q);
    if (!url) return '';
    try {
      const found = pick(s, q, JSON.parse(new TextDecoder().decode(await ask(s, url))));
      if (!found) continue;
      const img = await ask(s, found);   // the Cover Art Archive answers 404 when a release has no front
      const c = await coverFromImage(img);
      await cache.putArt(c.hash, 64, c.small);
      await cache.putArt(c.hash, 320, c.large);
      counts.found++;
      return c.hash;
    } catch { /* this service didn't have it (or didn't answer): the next one */ }
  }
  return '';
}
