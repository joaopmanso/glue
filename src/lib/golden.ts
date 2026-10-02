/* The reference for GLUE Home's native engine on lossy files (ADR 0147, through window.__gluePerf with ?perf): a file
   analysed by the worker pool exactly as GLUE Home's service page does it (home/ui/cache.ts), with every output, and
   the decoded samples' shape. e2e/golden.spec.ts writes it into tests/golden. */
import { AnalysisPool } from './pool';
import { decodedByWorker } from './analysis';
import { encodeFingerprint } from '../store/fingerprints';
import { analysed } from '../core/library/analysed';

const b64 = (u: Uint8Array) => { let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(s); };

async function inflate(bin: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([bin.slice()]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
}
async function sha256(u: Uint8Array) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', u.slice()))].map(b => b.toString(16).padStart(2, '0')).join(''); }

export async function golden(url: string) {
  const blob = await (await fetch(url)).blob(), name = url.split('/').pop() ?? 'file', mtime = 1_700_000_000_000;
  const file = new File([blob], name, { lastModified: mtime });
  const pool = new AnalysisPool(1);
  try {
    const r = await pool.analyze(file, mtime);
    const raw = r.details ? await inflate(r.details.bin) : null;
    const d = await decodedByWorker(file);
    const ch = d.type === 'float' ? d.channels : [];
    const head = (c: Float32Array) => Array.from(c.subarray(0, 64));
    return {
      summary: r.summary, info: r.info,
      files: {
        details: r.details ? { header: r.details.header, rawSha256: await sha256(raw!), rawLength: raw!.length } : null,
        thumb: r.thumb ? b64(r.thumb) : null, wave: r.wave ? b64(r.wave) : null, fingerprint: r.fp ? b64(encodeFingerprint(r.fp)) : null,
        analysed: analysed({ summary: r.summary, info: r.info, duration: r.duration, art: r.art }, file.size, mtime),
      },
      decode: { sr: d.type === 'float' ? d.sr : null, frames: ch[0]?.length ?? 0, channels: ch.length, head: ch.map(head), energy: ch.map(c => { let e = 0; for (const v of c) e += v * v; return e; }) },
    };
  } finally { pool.stop(); }
}
