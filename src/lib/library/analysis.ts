/* Background analysis: the queue, the pool, GLUE Home analysing instead (ADR 0103, 0125); stored details; verdicts judged again.
   Part of `lib` (src/lib/library.svelte.ts): its methods, `this` being the library. */
import { timeAsync } from '../../core/perf';
import { fileAt } from '../../store/fsx';
import { ANALYSIS_VERSION, VERDICT_VERSION, type Track } from '../../store/types';
import { makeThumb, makeWaveThumb } from '../../core/library/thumb';
import { failed, summarize } from '../../core/library/summary';
import { afterAnalysis, analysed, analysisState, isTransient, needsAnalysis } from '../../core/library/analysed';
import { classify } from '../../core/audio/verdict';
import { encodeDetails, loadDetails, writeDetails, type DetailsHeader } from '../../store/details';
import { writeFingerprint } from '../../store/fingerprints';
import type { AnalysisResult, FileInfo } from '../../core/types';
import * as platform from '../../platform';
import { AnalysisPool } from '../pool';
import { player } from '../player.svelte';
import type { Library } from '../library.svelte';

export const analysis = {
  /** After a verdict rule change: judge stored analyses again (no decoding), one at a time in the
      background. Warnings and failures can change, and "Genuine hi-res" (an upsample could pass for it until
      2026-09-30); the stored analysis comes from this browser or GLUE Home's cache (ADR 0110). */
  async recheckVerdicts(this: Library) {
    const s = this.store;
    if (!s || this.readOnly) return;
    const todo = [...s.analysis].filter(([id, a]) => (a.vv ?? 1) < VERDICT_VERSION && !a.error && (a.grade === 'warn' || a.grade === 'bad' || a.label === 'Genuine hi-res') && !s.tracks.get(id)?.remote).map(([id]) => id);
    let cleared = 0, flagged = 0;
    for (const id of todo) {
      if (this.store !== s) return;
      const t = s.tracks.get(id), prev = s.analysis.get(id);
      if (!t || !prev || (prev.vv ?? 1) >= VERDICT_VERSION) continue;
      try {
        const d = await this.trackDetails(t);
        if (this.store !== s) return;
        if (!d) continue;   // no stored analysis: the next full analysis brings the new rules
        const next = summarize(d.info, d.res, classify(d.info, d.res), { size: prev.fileSize, mtime: prev.fileMtime });
        s.putAnalysis(id, { ...next, at: prev.at, fp: prev.fp });
        if (next.grade === 'ok' && prev.grade !== 'ok') cleared++;
        else if (next.grade !== 'ok' && prev.grade === 'ok') flagged++;
      } catch (e) { console.warn('Couldn’t re-check the verdict of', id, e); }
      await new Promise(r => setTimeout(r, 0));   // stay out of the way of the page
    }
    if ((cleared || flagged) && this.store === s) this.notice = 'Quality verdicts updated: ' + [cleared ? cleared + ' song' + (cleared === 1 ? '' : 's') + ' now count as fine (a quiet top end is still hi-res)' : '', flagged ? flagged + ' found upsampled' : ''].filter(Boolean).join(', ') + '.';
  },
  /** The full analysis stored for a track's page, if it's still valid for the file. */
  async trackDetails(this: Library, t: Track) {
    const s = this.store, dir = await platform.cacheDir();
    if (!s || !dir) return null;
    const here = await loadDetails(dir, s.meta.id, t.id, { size: t.size, mtime: t.mtime });
    if (here || t.remote || !this.detailsFromHome) return here;
    // Not in this browser: GLUE Home's (ADR 0110), kept here once it's of this file.
    const d = await this.detailsFromHome(t.id).catch(() => null);
    if (!d || this.store !== s) return null;
    await writeDetails(dir, s.meta.id, t.id, d).catch(() => {});
    return loadDetails(dir, s.meta.id, t.id, { size: t.size, mtime: t.mtime });
  },
  async saveTrackDetails(this: Library, t: Track, info: FileInfo, res: AnalysisResult) {
    if (t.size == null || t.mtime == null) return;
    try { await this.putDetails(t.id, await encodeDetails(info, res, { size: t.size, mtime: t.mtime })); this.onThumb?.(t.id, makeThumb(res)); this.onWave?.(t.id, makeWaveThumb(res)); }
    catch (e) { console.warn('Couldn’t store the track analysis', e); }
  },
  async putDetails(this: Library, id: string, d: { header: DetailsHeader; bin: Uint8Array }) {
    const s = this.store, dir = await platform.cacheDir();
    if (s && dir) await writeDetails(dir, s.meta.id, id, d);
  },

  needsAnalysis(this: Library, t: Track) { return needsAnalysis(t, this.store?.analysis.get(t.id), ANALYSIS_VERSION); },
  /** Where a song's analysis stands (ADR 0109): one meaning for the sidebar, the lists and Stats. */
  analysisState(this: Library, t: Track) { return analysisState(t, this.store?.analysis.get(t.id), ANALYSIS_VERSION); },
  pendingCount(this: Library) { let n = 0; for (const t of this.store?.tracks.values() ?? []) if (this.needsAnalysis(t)) n++; return n; },
  enqueueAll(this: Library) {
    const s = this.store;
    if (!s) return;
    // Another computer's songs are analysed there (and shared): never downloaded here to be analysed.
    this.queue = [...s.tracks.values()].filter(t => !t.remote && this.canRead(t) && this.needsAnalysis(t) && !this.active.has(t.id) && (this.tries.get(t.id) ?? 0) < 3)
      .sort((a, b) => a.addedAt.localeCompare(b.addedAt)).map(t => t.id);
    this.pump();
  },
  /** Analyse this one next (the user is looking at it). */
  prioritize(this: Library, id: string) { this.queue = [id, ...this.queue.filter(x => x !== id)]; },
  /** Background analysis on or off, kept per collection (a big import needn't all be analysed). */
  pauseAnalysis(this: Library, p: boolean) {
    const s = this.store;
    if (s) { s.meta.autoAnalyse = !p; s.saveMeta(); }
    this.analysis = { ...this.analysis, paused: p };
    this.analysisElsewhere?.pause(p);
    if (!p) this.enqueueAll();
  },
  /** A song analysed elsewhere on this computer (its GLUE Home), taken in like one analysed here. */
  takeAnalysed(this: Library, id: string, a: import('../../core/library/analysed').Analysed) {
    const s = this.store, cur = s?.tracks.get(id);
    if (!s || !cur || cur.remote) return false;
    s.putAnalysis(id, a.summary);
    s.putTrack(afterAnalysis(cur, a));
    this.analysis = { ...this.analysis, done: this.analysis.done + 1, failed: this.analysis.failed + (a.summary.error ? 1 : 0) };
    return true;
  },
  /** This tab's own analysis stops (its GLUE Home took over, ADR 0103); nothing is paused. */
  stopOwnAnalysis(this: Library) { const paused = this.analysis.paused; this.stopAnalysis(); this.analysis = { ...this.analysis, paused }; this.enqueueAll(); },
  /** A song only this browser can read: added on its own, a file handle with no path (ADR 0125). GLUE Home can't
      analyse it, so this tab does, even while GLUE Home analyses the rest (a dropped song was never analysed,
      2026-10-01). */
  onlyHere(this: Library, t: Track | undefined) { return !!t && !t.remote && !!t.fileKey?.startsWith('file:') && !t.filePath; },
  /** Stop now: what runs stops, and background analysis is off until it's turned on again. */
  stopAnalysisNow(this: Library) {
    this.pauseAnalysis(true);
    this.stopAnalysis();
  },
  /** Analyse these tracks now (asked for: analysed or not), even with background analysis off. */
  analyseNow(this: Library, ids: string[]) {
    const s = this.store;
    if (!s) return 0;
    let asked = 0;
    if (this.analysisElsewhere?.active()) {
      const there = ids.filter(id => !this.onlyHere(s.tracks.get(id)));
      if (there.length) asked = this.analysisElsewhere.now(there);
      ids = ids.filter(id => this.onlyHere(s.tracks.get(id)));
    }
    const want = ids.filter(id => { const t = s.tracks.get(id); return !!t && !t.remote && t.status === 'linked' && this.canRead(t) && !this.active.has(id); });
    for (const id of want) this.forced.add(id);
    this.manual = [...want, ...this.manual.filter(x => !want.includes(x))];
    this.pump();
    return asked + want.length;
  },
  stopAnalysis(this: Library) { this.stops++; this.queue = []; this.manual = []; this.pool?.stop(); this.pool = null; this.active.clear(); this.analysis = { running: 0, done: 0, failed: 0, paused: this.analysis.paused }; },

  pump(this: Library) {
    if (this.readOnly || this.stemsBusy) return;
    // This computer's GLUE Home analyses its songs (ADR 0103): here, only those it can't read (ADR 0125).
    if (this.analysisElsewhere?.active()) {
      const s = this.store;
      this.queue = this.queue.filter(id => this.onlyHere(s?.tracks.get(id)));
      this.manual = this.manual.filter(id => this.onlyHere(s?.tracks.get(id)));
      if (!this.queue.length && !this.manual.length) return;
    }
    // With background analysis off, only tracks asked for explicitly are analysed.
    if (this.analysis.paused && !this.manual.length) return;
    this.pool ??= new AnalysisPool();
    // One at a time while music is playing, so playback and the live view stay smooth.
    const limit = player.paused ? this.pool.size : 1;
    while (this.active.size < limit && (this.manual.length || (!this.analysis.paused && this.queue.length))) {
      const id = this.manual.length ? this.manual.shift()! : this.queue.shift()!;
      const t = this.store?.tracks.get(id);
      if (!t || (!this.needsAnalysis(t) && !this.forced.delete(id))) continue;
      this.active.add(id);
      this.analysis = { ...this.analysis, running: this.active.size };
      void this.analyseOne(t).finally(() => {
        this.active.delete(id);
        this.analysis = { ...this.analysis, running: this.active.size };
        this.pump();
        if (!this.active.size && !this.manual.length && (this.analysis.paused || !this.queue.length)) this.onSettled?.();
      });
    }
  },
  async analyseOne(this: Library, t: Track) {
    const s = this.store, pool = this.pool, stops = this.stops;
    if (!s || !pool) return;
    let file: File;
    try { file = t.fileKey ? await this.looseFile(t, false) : await fileAt(this.rootState(t.rootId)!.dir!, t.relPath!); }
    catch (e) {
      if ((e as DOMException).name !== 'NotFoundError') return;
      // Its folder isn't reachable (a network folder not connected): the song waits, it isn't missing (each song
      // looked at was marked missing, on every device).
      const r = t.fileKey ? null : this.rootState(t.rootId);
      if (r && !(await platform.folderReachable(r.root, r.dir).catch(() => false))) { this.folderAway(r.root); return; }
      s.putTrack({ ...t, status: 'missing' }); return;
    }
    try {
      const r = await timeAsync('analysis.track', () => pool.analyze(file, file.lastModified));
      if (this.store !== s || this.stops !== stops) return;
      // The stored analysis and fingerprint go first: once a track shows as analysed, its page opens instantly.
      if (r.details) await this.putDetails(t.id, r.details).catch(e => console.warn('Couldn’t store the track analysis', e));
      if (r.fp) { const d = await platform.cacheDir(); if (d) await writeFingerprint(d, s.meta.id, t.id, r.fp).catch(e => console.warn('Couldn’t store the fingerprint', e)); }
      if (this.store !== s) return;
      if (r.thumb) this.onThumb?.(t.id, r.thumb);
      if (r.wave) this.onWave?.(t.id, r.wave);
      if (r.art) await this.onArt?.(r.art);
      s.putAnalysis(t.id, r.summary);
      s.putTrack(afterAnalysis(s.tracks.get(t.id) ?? t, analysed(r, file.size, file.lastModified)));
      this.analysis = { ...this.analysis, done: this.analysis.done + 1 };
    } catch (e) {
      if (this.store !== s || this.stops !== stops) return;   // stopped: not a failure, analysed another time
      // Out of time or memory: tried again later, a few times a visit (ADR 0109), never saved as the song's. Any other
      // failure is tried once more first: one under load isn't proof, and a song saved as failed leaves the library's
      // lists (2026-09-30).
      const n = (this.tries.get(t.id) ?? 0) + 1;
      this.tries.set(t.id, n);
      if (isTransient(String((e as Error)?.message)) || n < 2) {
        if (n < 3) this.queue.push(t.id);   // again, after the others
        this.analysis = { ...this.analysis, done: this.analysis.done + 1, failed: this.analysis.failed + 1 };
        return;
      }
      s.putAnalysis(t.id, failed(String((e as Error)?.message || 'The browser couldn’t decode it.').replace(/^(EncodingError: )?(Unable to decode.*|decode failed)$/i, 'The browser couldn’t decode it.'), { size: file.size, mtime: file.lastModified }));
      this.analysis = { ...this.analysis, done: this.analysis.done + 1, failed: this.analysis.failed + 1 };
    }
  },
};
