/* The small record kept per analysed track (ADR 0019); the detail page recomputes everything else. */
import type { AnalysisResult, FileInfo, Verdict } from '../types';
import type { AnalysisSummary } from '../../store/types';
import { ANALYSIS_VERSION, VERDICT_VERSION } from '../../store/types';

export function summarize(info: FileInfo, res: AnalysisResult, v: Verdict, file: { size: number; mtime: number }): AnalysisSummary {
  const k = res.music.key;
  return {
    v: ANALYSIS_VERSION, at: new Date().toISOString(),
    grade: v.grade, label: v.label, headline: v.headline,
    fc: Math.round(v.cut.fc), wall: v.cut.wall, full: v.cut.full,
    effBits: v.depth ? v.depth.eff : null, declaredBits: info.bits || 0,
    origin: v.origin,
    bpm: res.music.bpm ? Math.round(res.music.bpm * 100) / 100 : null,
    key: k ? { tonic: k.tonic, mode: k.mode, margin: Math.round(k.margin * 1000) / 1000, tuning: Math.round(k.tuning) } : null,
    findings: v.findings.map(f => ({ sev: f.sev, title: f.title })),
    fileSize: file.size, fileMtime: file.mtime, vv: VERDICT_VERSION,
  };
}

export function failed(message: string, file: { size: number; mtime: number }): AnalysisSummary {
  return {
    v: ANALYSIS_VERSION, at: new Date().toISOString(), grade: 'info', label: 'Not analysed', headline: message,
    fc: 0, wall: false, full: false, effBits: null, declaredBits: 0, origin: '', bpm: null, key: null, findings: [],
    fileSize: file.size, fileMtime: file.mtime, error: message,
  };
}

/** A verdict the user marked as fine (a false positive, the user's list 2026-09-28): shown as fine
    while GLUE's verdict is still the one they cleared; a different verdict later shows again. */
export const MARKED_FINE = 'Marked fine';
export function asShown<A extends { grade: 'ok' | 'warn' | 'bad' | 'info'; label: string; headline: string; error?: string }>(t: { markedFine?: string } | null | undefined, a: A | null | undefined): A | null {
  if (!a) return null;
  if (!t?.markedFine || a.error || a.grade === 'ok' || a.label !== t.markedFine) return a;
  return { ...a, grade: 'ok', label: MARKED_FINE, headline: 'You marked this as fine. GLUE says: ' + a.headline };
}
