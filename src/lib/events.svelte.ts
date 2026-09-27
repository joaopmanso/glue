/* Events (ADR 0074): gigs and sessions, each with a folder in Playlists (Events › '2026-10-03 · Lux')
   for the versions of playlists made for it, and playlists elsewhere assigned to it. Flyers are images
   in the collection's `events/` folder. */
import { lib } from './library.svelte';
import { tracksFor } from './view.svelte';
import { blankEvent, folderName, isPast, needsMusic, parseLocal, type GlueEvent } from '../core/library/events';
import { fileAt, removePath, writeBlob } from '../store/fsx';
import { newId, type List, type Track } from '../store/types';

const FLYER_MAX = 1400;

class Events {
  /** Bumps when a flyer changes (its picture reloads). */
  flyerVersion = $state(0);
  private flyerUrls = new Map<string, string>();

  /** Every event, soonest first. */
  all(): GlueEvent[] {
    void lib.version;
    return [...lib.store?.events.values() ?? []].sort((a, b) => a.starts.localeCompare(b.starts) || a.name.localeCompare(b.name));
  }
  get(id: string) { void lib.version; return lib.store?.events.get(id) ?? null; }
  upcoming(now = new Date()) { return this.all().filter(e => !isPast(e, now)); }
  past(now = new Date()) { return this.all().filter(e => isPast(e, now)).reverse(); }

  /** Its playlists: the ones in its folder (versions made for it) and the ones assigned to it. */
  listsOf(e: GlueEvent): { versions: List[]; assigned: List[] } {
    void lib.version;
    const s = lib.store;
    if (!s) return { versions: [], assigned: [] };
    const versions: List[] = [], walk = (pid: string) => { for (const l of lib.childLists(pid)) { if (l.kind === 'playlist') versions.push(l); else walk(l.id); } };
    if (e.folderId && s.lists.has(e.folderId)) walk(e.folderId);
    return { versions, assigned: e.lists.map(id => s.lists.get(id)).filter((l): l is List => !!l) };
  }
  /** All its songs (each once): its folder's, then the assigned playlists'. */
  tracksOf(e: GlueEvent): Track[] {
    void lib.version;
    const seen = new Set<string>(), out: Track[] = [];
    const add = (ts: Track[]) => { for (const t of ts) if (!seen.has(t.id)) { seen.add(t.id); out.push(t); } };
    if (e.folderId) add(tracksFor({ kind: 'list', id: e.folderId }));
    for (const id of e.lists) add(tracksFor({ kind: 'list', id }));
    return out;
  }
  /** Coming soon, with no music yet (GLUE shows a reminder). */
  needing(now = new Date()): GlueEvent[] { return this.upcoming(now).filter(e => needsMusic(e, this.tracksOf(e).length, now)); }

  /** A new event on a day, with its folder; returns it. */
  create(fields: Partial<GlueEvent> & { starts: string }): GlueEvent | null {
    const s = lib.store;
    if (!s || lib.readOnly) return null;
    const e: GlueEvent = { ...blankEvent(newId(), fields.starts.slice(0, 10)), ...fields };
    e.folderId = this.folderFor(e);
    s.putEvent(e);
    return e;
  }
  update(id: string, patch: Partial<GlueEvent>) {
    const s = lib.store, e = s?.events.get(id);
    if (!s || !e || lib.readOnly) return;
    const next = { ...e, ...patch };
    // Its folder follows its name and day.
    const f = next.folderId ? s.lists.get(next.folderId) : null;
    if (f && (next.name !== e.name || next.starts.slice(0, 10) !== e.starts.slice(0, 10))) lib.updateList(f.id, { name: folderName(next) });
    if (!f) next.folderId = this.folderFor(next);
    s.putEvent(next);
  }
  /** Delete an event; its folder (and the versions in it) too when asked. Assigned playlists stay. */
  async remove(id: string, withFolder: boolean) {
    const s = lib.store, e = s?.events.get(id);
    if (!s || !e) return;
    if (e.folderId) {
      if (withFolder) lib.deleteList(e.folderId);
      else { const f = s.lists.get(e.folderId); if (f) s.putList({ ...f, event: undefined }); }
    }
    if (e.flyer) await removePath(s.root, `${s.base}/events/${e.flyer}`).catch(() => {});
    s.deleteEvent(id);
  }
  assign(id: string, listId: string) { const e = this.get(id); if (e && !e.lists.includes(listId)) this.update(id, { lists: [...e.lists, listId] }); }
  unassign(id: string, listId: string) { const e = this.get(id); if (e) this.update(id, { lists: e.lists.filter(x => x !== listId) }); }
  /** A copy of a playlist in the event's folder, to trim and reorder for it. */
  makeVersion(id: string, listId: string): List | null {
    const s = lib.store, e = this.get(id), src = s?.lists.get(listId);
    if (!s || !e || !src) return null;
    const folder = e.folderId && s.lists.has(e.folderId) ? e.folderId : this.folderFor(e);
    if (folder !== e.folderId) this.update(id, { folderId: folder });
    const items = src.kind === 'folder' ? tracksFor({ kind: 'list', id: src.id }).map(t => t.id) : [...src.items];
    return lib.createList('playlist', src.name, folder, items);
  }
  /** The event whose folder this is (or that a playlist inside it belongs to). */
  ofList(listId: string): GlueEvent | null {
    const s = lib.store;
    for (let l = s?.lists.get(listId); l; l = l.parentId ? s!.lists.get(l.parentId) : undefined) if (l.event && l.event !== '*') return s!.events.get(l.event) ?? null;
    return null;
  }

  /** The event's folder, made (with the Events folder above it) when it has none. */
  private folderFor(e: GlueEvent): string | null {
    const s = lib.store;
    if (!s) return null;
    const have = e.folderId && s.lists.get(e.folderId);
    if (have) return have.id;
    let top = [...s.lists.values()].find(l => l.event === '*' && l.kind === 'folder');
    if (!top) { const t = lib.createList('folder', 'Events'); if (!t) return null; top = { ...t, event: '*' }; s.putList(top); }
    const f = lib.createList('folder', folderName(e), top.id);
    if (!f) return null;
    s.putList({ ...f, event: e.id });
    return f.id;
  }

  // ─── Flyers ─────────────────────────────────────────────────────────────────────────────────────
  /** Keep a flyer (made smaller, as JPEG) in the collection's events folder. */
  async setFlyer(id: string, file: Blob) {
    const s = lib.store, e = s?.events.get(id);
    if (!s || !e) return;
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, FLYER_MAX / Math.max(bmp.width, bmp.height)), c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
    const g = c.getContext('2d')!;
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close();
    const blob = await c.convertToBlob({ type: 'image/jpeg', quality: 0.86 }), name = e.id + '-' + Date.now().toString(36) + '.jpg';
    await writeBlob(s.root, `${s.base}/events/${name}`, blob);
    if (e.flyer) await removePath(s.root, `${s.base}/events/${e.flyer}`).catch(() => {});
    this.update(id, { flyer: name });
    this.flyerVersion++;
  }
  async removeFlyer(id: string) {
    const s = lib.store, e = s?.events.get(id);
    if (!s || !e?.flyer) return;
    await removePath(s.root, `${s.base}/events/${e.flyer}`).catch(() => {});
    this.update(id, { flyer: null });
    this.flyerVersion++;
  }
  /** The flyer's picture, as a URL (null when there's none or it can't be read). */
  async flyerUrl(e: GlueEvent): Promise<string | null> {
    const s = lib.store;
    if (!s || !e.flyer) return null;
    const have = this.flyerUrls.get(e.flyer);
    if (have) return have;
    const f = await fileAt(s.root, `${s.base}/events/${e.flyer}`).catch(() => null);
    if (!f) return null;
    const u = URL.createObjectURL(f);
    this.flyerUrls.set(e.flyer, u);
    return u;
  }
}
export const events = new Events();

/** 'Sat 3 Oct 2026', and the time when there is one. */
export function fmtWhen(s: string, opts: { year?: boolean; time?: boolean } = {}): string {
  const d = parseLocal(s);
  if (!d) return s;
  const day = d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', ...(opts.year === false ? {} : { year: 'numeric' }) });
  return opts.time !== false && s.length > 10 ? day + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }) : day;
}
