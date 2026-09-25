/* Verdict: compare what the file claims (FileInfo) with what it holds (analysis). Pure. */
import type { Cutoff, FileInfo, Finding, Grade, SampleStats, Severity, Verdict } from '../types';
import { fmtKHz, fmtRate } from '../format';

export function detectCutoff(ltas: Float32Array, binHz: number, sr: number): Cutoff {
  const n = ltas.length, nyq = sr / 2;
  const pw = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) pw[k + 1] = pw[k] + Math.pow(10, ltas[k] / 10);
  const w = Math.max(1, Math.round(75 / binHz)), sm = new Float32Array(n);
  for (let k = 0; k < n; k++) {
    const a = Math.max(0, k - w), b = Math.min(n - 1, k + w);
    sm[k] = Math.max(-200, 10 * Math.log10((pw[b + 1] - pw[a]) / (b - a + 1) + 1e-30));
  }
  const ps = new Float64Array(n + 1);
  for (let k = 0; k < n; k++) ps[k + 1] = ps[k] + sm[k];
  const bin = (f: number) => Math.max(0, Math.min(n - 1, Math.round(f / binHz)));
  const mean = (f0: number, f1: number) => { const a = bin(f0), b = bin(f1); return b < a ? NaN : (ps[b + 1] - ps[a]) / (b - a + 1); };
  const pct = (f0: number, f1: number, q: number) => { const arr = Array.from(sm.subarray(bin(f0), bin(f1) + 1)).sort((x, y) => x - y); return arr[Math.floor(q * (arr.length - 1))]; };
  const globalFloor = pct(1000, nyq * 0.995, 0.05);
  const ref = pct(200, Math.min(nyq * 0.8, 12000), 0.5);

  let wall: { fc: number; drop: number } | null = null;
  const step = Math.max(1, Math.round(50 / binHz));
  for (let k = bin(nyq - 950); k >= bin(2000); k -= step) {
    const f = k * binHz, below = mean(f - 900, f - 300), above = mean(f + 300, f + 900);
    if (below - above < 18) continue;
    if (mean(f + 300, Math.min(nyq * 0.995, f + 4000)) > globalFloor + 12) continue;
    const mid = (below + above) / 2;
    let fc = f;
    for (let j = bin(f + 900); j >= bin(f - 900); j--) if (sm[j] >= mid) { fc = j * binHz; break; }
    const b2 = mean(fc - 1200, fc - 400), a2 = mean(fc + 400, Math.min(nyq * 0.995, fc + 1200));
    wall = { fc, drop: b2 - a2 };
    break;
  }
  // Natural roll-offs sink into the floor gently, so any sustained lift above it counts as content.
  const thresh = globalFloor + 6, need = Math.max(2, Math.round(400 / binHz));
  let run = 0, fade = 0;
  for (let k = n - 1; k >= 0; k--) {
    if (sm[k] > thresh) { if (++run >= need) { fade = (k + need - 1) * binHz; break; } } else run = 0;
  }
  const fc = wall ? wall.fc : fade;
  const full = fc >= 0.93 * nyq;

  let rising = false;
  if (nyq > 40000) rising = mean(nyq * 0.75, nyq * 0.95) > mean(24000, 30000) + 6;

  let imaging: Cutoff['imaging'] = null;
  if (sr >= 88200 && !rising) {
    for (const r of [44100, 48000]) {
      const m = r / 2, span = Math.min(m * 0.7, nyq - m - 500);
      if (span < 3000) continue;
      let sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0, cnt = 0, sad = 0;
      const dstep = Math.max(binHz, span / 300);
      for (let d = 1000; d <= span; d += dstep) {
        const x = sm[bin(m - d)], y = sm[bin(m + d)];
        sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; sad += Math.abs(x - y); cnt++;
      }
      const cov = sxy / cnt - (sx / cnt) * (sy / cnt), vx = sxx / cnt - (sx / cnt) ** 2, vy = syy / cnt - (sy / cnt) ** 2;
      const corr = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
      if (corr > 0.85 && sad / cnt < 8 && mean(m + 1000, m + span) > globalFloor + 10) { imaging = { r, corr }; break; }
    }
  }
  return { fc, wall: !!wall, drop: wall ? wall.drop : 0, full, fade, globalFloor, ref, rising, imaging, sm };
}

const EXPECTED: Record<string, [number, number][]> = {
  MP3: [[64, 11000], [80, 13500], [96, 15100], [112, 15600], [128, 17000], [160, 17500], [192, 18600], [224, 19400], [256, 19700], [320, 20500]],
  AAC: [[64, 13000], [96, 15000], [128, 16000], [160, 17000], [192, 18000], [256, 19500], [320, 20000]],
  Vorbis: [[96, 15000], [128, 16500], [160, 18000], [192, 19000], [256, 20000], [320, 21000]],
  Opus: [[24, 12000], [40, 20000]],
};
export function expectedCutoff(info: FileInfo): { hz: number; why: string } | null {
  if (info.lameLowpass) return { hz: info.lameLowpass, why: 'lowpass stored in the LAME header' };
  const c = info.codec || '';
  if (/HE-AAC/.test(c)) return null;
  const fam = /^MP3/.test(c) ? 'MP3' : /^AAC/.test(c) ? 'AAC' : c === 'Vorbis' ? 'Vorbis' : c === 'Opus' ? 'Opus' : null;
  const br = info.bitrate || info.nominalBitrate;
  if (!fam || !br) return null;
  const eff = info.channels === 1 ? br * 1.6 : br;
  const t = EXPECTED[fam];
  let hz = t[0][1];
  for (const [b, f] of t) if (eff >= b * 0.93) hz = f;
  return { hz: Math.min(hz, info.sampleRate / 2 || hz), why: 'typical for ' + fam + ' at ' + Math.round(br) + ' kbps' };
}

export function lossyGuess(fc: number, yt: boolean): { short: string; text: string } {
  if (fc < 11500) return { short: 'Very low bitrate lossy', text: 'very low bitrate lossy audio (64 kbps or less), or a 22 kHz source' };
  if (fc < 14500) return { short: 'Low bitrate MP3/AAC', text: 'low bitrate MP3 or AAC (about 64–96 kbps): old downloads, previews or voice-grade rips' };
  if (fc < 16600) return { short: yt ? 'YouTube AAC rip' : '128 kbps MP3/AAC', text: '128 kbps AAC or MP3, the classic cutoff of YouTube’s AAC stream (format 140), SoundCloud MP3s and older Fraunhofer encoders' };
  if (fc < 17600) return { short: '128–160 kbps MP3', text: 'MP3 at about 128–160 kbps (LAME lowpasses at 17.0–17.5 kHz for these rates)' };
  if (fc < 18900) return { short: '~192 kbps MP3/AAC', text: 'MP3 or AAC at about 192 kbps (LAME lowpasses at 18.6 kHz)' };
  if (fc < 19600) return { short: '224–256 kbps MP3/AAC', text: 'MP3 at 224–256 kbps or LAME V0, or 256 kbps AAC as sold by iTunes / Apple Music' };
  if (fc < 20300) return { short: yt ? 'YouTube Opus rip' : 'Opus or MP3 320', text: 'Opus, which always stops at 20 kHz (as in YouTube’s Opus stream, format 251), or a 320 kbps MP3 / 256 kbps AAC' };
  return { short: '320 kbps MP3', text: 'MP3 at 320 kbps (LAME lowpasses at about 20.5 kHz) or high-quality AAC/Vorbis' };
}

/** A lossless CD / 48 kHz file whose top end fades out (no wall) from here up is fine (ADR 0033). */
export const ROLL_OFF_OK = 17000;
/** A "wall" this high and this shallow can be a steep mastering filter: never called a transcode on its own. */
export const SOFT_WALL = { hz: 18500, drop: 30 };

export function findResample(cut: Cutoff, sr: number): number | null {
  if (cut.full) return null;
  let best: { r: number; d: number } | null = null;
  for (const r of [22050, 24000, 32000, 44100, 48000, 88200, 96000]) {
    if (r > sr * 0.6) continue;
    const ratio = cut.fc / (r / 2);
    if (ratio >= 0.86 && ratio <= 1.01) {
      const d = Math.abs(ratio - 0.955);
      if (!best || d < best.d) best = { r, d };
    }
  }
  return best ? best.r : null;
}

/** How far real content reaches in the louder moments (a peak-hold over time of the spectrogram),
    as opposed to the long-term average the cutoff is measured on. Hats, cymbals, noise or a thin
    line can sit well above the noise floor while hardly moving the average. An encoder removes
    everything above its lowpass all the time, so content up there means nothing cut the top off
    (ADR 0033). Fixed bands, so a stored (row-reduced) spectrogram gives the same answer. */
export function peakReach(spec: Float32Array, cols: number, rows: number, sr: number): number | null {
  if (!spec?.length || !cols || rows < 64) return null;
  // Per band: the loud moments (95th percentile over time) and the quiet ones (20th); the noise floor
  // is the quietest band in quiet moments, so steady content up there can't pass for the floor.
  const B = 128, nyq = sr / 2, per = rows / B, P = new Float32Array(B), Q = new Float32Array(B), col = new Float32Array(cols);
  for (let b = 0; b < B; b++) {
    const r0 = Math.floor(b * per), r1 = Math.max(r0 + 1, Math.floor((b + 1) * per));
    for (let c = 0; c < cols; c++) { let m = -Infinity; for (let r = r0; r < r1; r++) m = Math.max(m, spec[c * rows + r]); col[c] = m; }
    col.sort();
    P[b] = col[Math.floor(0.95 * (cols - 1))]; Q[b] = col[Math.floor(0.2 * (cols - 1))];
  }
  const b1 = Math.ceil(1000 / nyq * B);
  let floor = Infinity;
  for (let b = b1; b + 2 < B; b++) floor = Math.min(floor, (Q[b] + Q[b + 1] + Q[b + 2]) / 3);
  // Content comes and goes (hats, cymbals, tails): louder moments well above both the floor and the
  // band's own quiet level. Steady hiss up there (e.g. noise-shaped dither) doesn't count.
  const on = (b: number) => P[b] > floor + 10 && P[b] > Q[b] + 6;
  for (let b = B - 1; b > b1; b--) if (on(b) && on(b - 1)) return (b + 1) * nyq / B;
  return b1 * nyq / B;
}

/** What the verdict needs from the analysis (the spectrogram is optional: it refines gentle fades). */
export interface VerdictInput { sr: number; stats: SampleStats; ltas: Float32Array; binHz: number; containerBits: number; spec?: Float32Array; cols?: number; rows?: number }
type Head = { grade: Grade; label: string; headline: string; sub: string };

const article = (word: string) => (/^[AEIOU]/i.test(word) ? 'an ' : 'a ') + word;

export function classify(info: FileInfo, res: VerdictInput): Verdict {
  const sr = res.sr, nyq = sr / 2, st = res.stats;
  const cut = detectCutoff(res.ltas, res.binHz, sr);
  const F: Finding[] = [];
  const add = (sev: Severity, title: string, detail: string) => F.push({ sev, title, detail });
  const fc = cut.fc, kHz = fmtKHz(fc);
  const lossless = info.lossless === true;
  const hiRes = sr > 48000;
  const clues = info.clues || [];
  const kinds = new Set(clues.map(c => c.kind));
  const yt = kinds.has('yt');
  let head: Head | null = null, origin: string | null = null, bwTone = 'ok';

  if (st.silent) {
    add('info', 'Digital silence', 'Every sample is zero, so there is nothing to measure.');
    return finishVerdict({ grade: 'info', label: 'Silent', headline: 'This file is silent', sub: 'Every sample is zero.' }, F, cut, info, res, null, 'info', null);
  }

  const lossySig = cut.wall && !cut.full && fc < 20800;
  const resampledFrom = findResample(cut, sr);
  const edge = (fc >= 19600 && cut.drop < 35) || (fc >= SOFT_WALL.hz && cut.drop < SOFT_WALL.drop);

  if (lossless) {
    if (lossySig) {
      const g = lossyGuess(fc, yt);
      origin = g.short;
      bwTone = edge ? 'warn' : 'bad';
      add(edge ? 'warn' : 'bad', 'Brick-wall cutoff at ' + kHz,
        'A lossless ' + fmtRate(sr) + ' file can carry content up to ' + fmtKHz(nyq) + '. Here it drops ' + Math.round(cut.drop) + ' dB within about a kilohertz at ' + kHz + ', which is what a lossy encoder’s lowpass filter leaves behind. Most likely source: ' + g.text + '.' +
        (edge ? ' Some masters are lowpassed near 20 kHz on purpose, so this one is not conclusive.' : ''));
      if (!edge) head = { grade: 'bad', label: 'Transcoded', headline: 'Lossy audio in ' + article(/^PCM/.test(info.codec) ? info.container.split(' ')[0] : info.codec) + ' wrapper', sub: 'The spectrum stops dead at ' + kHz + ', the signature of ' + g.short.replace(/^\w/, c => c.toLowerCase()) + (hiRes ? ', later upsampled to ' + fmtRate(sr) : '') + '. Converting to lossless can’t restore what the encoder removed.' };
    } else if (cut.full) {
      add('ok', 'Content reaches ' + fmtKHz(Math.max(fc, cut.fade)), hiRes ? 'Energy continues well past 24 kHz, beyond anything a CD (22.05 kHz) or 48 kHz master can hold.' : 'The spectrum runs all the way to the ' + fmtKHz(nyq) + ' limit of a ' + fmtRate(sr) + ' file.');
      origin = hiRes ? 'Hi-res master' : 'Full-band master';
    } else if (hiRes && resampledFrom) {
      const bad = resampledFrom <= 48000;
      bwTone = bad ? 'bad' : 'warn';
      origin = fmtRate(resampledFrom) + ' source, upsampled';
      add(bad ? 'bad' : 'warn', 'Content stops at ' + kHz,
        'Nothing meaningful above ' + kHz + ', just under the ' + fmtKHz(resampledFrom / 2) + ' limit of ' + fmtRate(resampledFrom) + ' audio. The file was upsampled from a ' + fmtRate(resampledFrom) + ' source; the extra samples carry no extra information.' +
        (bad ? '' : ' It is still hi-res, just not ' + fmtRate(sr) + ' hi-res.'));
      head = { grade: bad ? 'bad' : 'warn', label: bad ? 'Upsampled' : 'Partly upsampled', headline: (bad ? 'Not hi-res: upsampled from ' : 'Upsampled from ') + fmtRate(resampledFrom), sub: 'The spectrum ends at ' + kHz + ', where a ' + fmtRate(resampledFrom) + ' recording has to stop. The ' + fmtRate(sr) + ' container adds size, not detail.' };
    } else if (hiRes && fc < 24500) {
      bwTone = 'warn';
      origin = 'Band-limited source';
      add('warn', 'Little content above ' + kHz, 'The spectrum fades out gradually before 24 kHz instead of hitting a wall. That fits an old or analog recording with limited bandwidth, or a CD-rate master converted with a gentle filter. Either way the hi-res sample rate adds nothing here.');
    } else if (hiRes) {
      origin = 'Hi-res master';
      add('ok', 'Content reaches ' + kHz, 'Real content above 24 kHz, which no CD or 48 kHz source can supply.');
    } else if (fc >= 20800) {
      origin = sr === 44100 ? 'CD-quality master' : 'Full-band master';
      add('ok', 'Full bandwidth, to ' + kHz, 'Normal for a lossless ' + fmtRate(sr) + ' file: the top end reaches the converter’s anti-alias filter.');
    } else if (fc >= ROLL_OFF_OK) {
      // A gentle roll-off in the last few kHz is a mastering choice (a lowpass, dark synths, limiting),
      // common on artist and label downloads; lossy encoders leave a wall instead (2026-09-25).
      origin = 'Rolled-off master';
      add('info', 'Top end rolls off from about ' + kHz, 'The highest frequencies fade out gradually instead of stopping at a wall. Many masters are made this way (a gentle lowpass, dark sounds, heavy limiting). It is not a lossy fingerprint.');
    } else if ((cut.reach = res.spec && res.cols && res.rows ? peakReach(res.spec, res.cols, res.rows, sr) ?? undefined : undefined) != null && cut.reach >= ROLL_OFF_OK) {
      origin = 'Rolled-off master';
      add('info', 'Quiet content up to ' + fmtKHz(cut.reach), 'Most of the energy fades out by about ' + kHz + ', but quieter content (cymbals, noise, thin lines) carries on up to ' + fmtKHz(cut.reach) + '. A lossy encoder removes everything above its cutoff, so nothing cut the top off here.');
    } else {
      bwTone = 'warn';
      origin = 'Band-limited source';
      add('warn', 'Band-limited to about ' + kHz, 'The top end fades out gradually rather than stopping at a wall. That is typical of older recordings or dark masters, and is not a clear lossy fingerprint.');
    }
    if (cut.imaging) {
      add('bad', 'Mirror image above ' + fmtKHz(cut.imaging.r / 2), 'The spectrum above ' + fmtKHz(cut.imaging.r / 2) + ' mirrors the spectrum below it, the mark of upsampling from ' + fmtRate(cut.imaging.r) + ' without a proper anti-imaging filter. That “content” is an artifact.');
      if (!head) head = { grade: 'bad', label: 'Upsampled', headline: 'Not hi-res: poorly upsampled from ' + fmtRate(cut.imaging.r), sub: 'What looks like ultrasonic content is a mirror image of the audible band.' };
      origin = fmtRate(cut.imaging.r) + ' source, upsampled';
    }
    if (hiRes && cut.rising) add('info', 'Rising ultrasonic noise', 'Noise climbs toward the top of the spectrum. That is typical of DSD-sourced or heavily noise-shaped material; the noise itself is not music.');
  } else if (info.lossless === false) {
    const exp = expectedCutoff(info);
    const br = info.bitrate || info.nominalBitrate || 0;
    if (exp && !cut.full && fc < exp.hz - 1500 && cut.wall) {
      const g = lossyGuess(fc, yt);
      // LAME's lowpass per bitrate is well known; AAC/Vorbis/Opus bandwidth varies by encoder, so only caution there.
      const sure = /^MP3/.test(info.codec) || !!info.lameLowpass;
      bwTone = sure ? 'bad' : 'warn';
      origin = sure ? 'Re-encode of ' + g.short.toLowerCase() : info.codec + ' encode';
      add(sure ? 'bad' : 'warn', 'Cutoff too low for ' + Math.round(br) + ' kbps', 'An encode at this bitrate would normally keep content up to about ' + fmtKHz(exp.hz) + ' (' + exp.why + '). This one stops at ' + kHz + (sure ? ', so it was probably re-encoded from ' + g.text + '.' : '. That can mean a re-encode of a lower-quality file, or just a conservative encoder.'));
      if (sure) head = { grade: 'bad', label: 'Fake bitrate', headline: 'Upconverted from a lower-quality file', sub: 'Labelled ' + info.codec + ' ' + Math.round(br) + ' kbps, but the content stops at ' + kHz + ', like ' + g.short.toLowerCase() + '. The extra bitrate stores nothing new.' };
    } else {
      origin = info.codec + ' encode';
      add('ok', 'Bandwidth fits the format', 'Content stops at ' + kHz + (exp ? '; ' + fmtKHz(exp.hz) + ' is ' + exp.why + '.' : '.'));
    }
    add('info', 'Lossy by design', info.codec + ' discards information to save space, so it can’t be hi-res whatever its sample rate. Converting it to FLAC or WAV won’t change that.');
  } else {
    add('info', 'Format not identified', 'The codec couldn’t be read from the container, so the verdict rests on the spectrum alone.');
    if (lossySig) {
      const g = lossyGuess(fc, yt);
      origin = g.short; bwTone = 'bad';
      add('bad', 'Brick-wall cutoff at ' + kHz, 'Content drops ' + Math.round(cut.drop) + ' dB within about a kilohertz at ' + kHz + ', the fingerprint of a lossy encoder. Most likely source: ' + g.text + '.');
      head = { grade: 'bad', label: 'Lossy', headline: 'Lossy audio: content stops at ' + kHz, sub: 'Whatever the container claims, this is ' + g.short.replace(/^\w/, c => c.toLowerCase()) + ' quality, nowhere near hi-res.' };
    } else if (hiRes && resampledFrom && resampledFrom <= 48000) {
      bwTone = 'bad'; origin = fmtRate(resampledFrom) + ' source, upsampled';
      add('bad', 'Content stops at ' + kHz, 'Nothing meaningful above ' + kHz + ', the limit of ' + fmtRate(resampledFrom) + ' audio, so the ' + fmtRate(sr) + ' rate adds nothing.');
    }
  }

  // Bit depth
  const declared = info.bits || 0;
  let depth: Verdict['depth'] = null;
  if (st.assessed && st.wasted != null && declared) {
    const eff = Math.min(declared, res.containerBits - st.wasted);
    depth = { eff, declared };
    if (eff < declared) {
      const sev: Severity = declared >= 20 && eff <= 16 ? 'bad' : 'warn';
      add(sev, 'Only ' + eff + ' of ' + declared + ' bits used', 'The lowest ' + (declared - eff) + ' bits are zero in every sample: this is ' + eff + '-bit audio padded out to ' + declared + ' bits. The padding carries nothing.');
      if (!head && sev === 'bad') head = { grade: 'bad', label: 'Padded', headline: 'Not 24-bit: ' + eff + '-bit audio padded with zeros', sub: 'Every sample’s bottom ' + (declared - eff) + ' bits are empty. The bandwidth may be fine, but the depth is CD-grade.' };
    } else if (declared >= 20) {
      add('ok', 'All ' + declared + ' bits in use', 'The low-order bits carry signal. A 16-bit master that had gain or dither applied after conversion would also pass this test, so read it alongside the spectrum.');
    }
  } else if (st.floatFmt) {
    if (st.on16 === 1) { depth = { eff: 16, declared: 32, float: true }; add('bad', '16-bit samples in a float file', 'Every sample lands exactly on the 16-bit grid, so this is 16-bit audio stored as 32-bit float.'); }
    else if (st.on24 === 1) { depth = { eff: 24, declared: 32, float: true }; add('info', '24-bit samples in a float file', 'Every sample lands exactly on the 24-bit grid.'); }
  } else if (lossless && declared && !st.assessed) {
    add('info', 'Bit depth not checked', 'The decoder didn’t return bit-exact samples, so the low bits couldn’t be inspected.');
  }

  // Provenance clues
  if (lossless && (kinds.has('mp3') || kinds.has('lossy'))) {
    add('bad', 'Lossy-encoder tag in a lossless file', 'The file contains a lossy encoder’s signature (' + clues.filter(c => c.kind === 'mp3' || c.kind === 'lossy').map(c => c.match).join(', ') + '). The audio probably passed through that encoder before it was saved as ' + info.codec + '.');
  }
  if (yt) {
    add(lossless ? 'bad' : 'warn', 'YouTube fingerprints', 'The container carries marks of a YouTube download (' + clues.filter(c => c.kind === 'yt').map(c => c.match).join(', ') + '). YouTube serves at best about 160 kbps Opus or 128 kbps AAC.');
    if (!origin || lossless) origin = origin && lossySig ? origin : 'YouTube download';
  }
  if (hiRes && kinds.has('rip')) add('bad', 'CD-ripper tag in a hi-res file', 'A CD ripper wrote these tags. A CD holds 16-bit / 44.1 kHz audio, so this ' + fmtRate(sr) + ' file was upconverted from a CD.');
  if (info.codec && /inside WAV/.test(info.codec)) add('bad', info.codec, 'The WAV container holds compressed audio, not PCM.');
  if (info.opusInputRate && info.opusInputRate !== 48000) add('info', 'Encoder input was ' + fmtRate(info.opusInputRate), 'Opus always decodes at 48 kHz; its header records the rate that was fed into the encoder.');

  // Channels and level
  if (st.lrIdentical) add('warn', 'Left and right are identical', 'This is mono presented as stereo.');
  else if (st.lrCorr != null && st.lrCorr > 0.999) add('info', 'Near-mono', 'The two channels are almost identical (correlation ' + st.lrCorr.toFixed(4) + ').');
  if (st.clipRuns > 20) add('info', st.clipRuns.toLocaleString() + ' clipped passages', 'Runs of full-scale samples: a loud, clipped master. That is a mastering choice, not a sign of a bad source.');

  return finishVerdict(head, F, cut, info, res, depth, bwTone, origin);
}

function finishVerdict(head: Head | null, F: Finding[], cut: Cutoff, info: FileInfo, res: VerdictInput,
  depth: Verdict['depth'], bwTone: string, origin: string | null): Verdict {
  const order: Record<Severity, number> = { bad: 0, warn: 1, ok: 2, info: 3 };
  F.sort((a, b) => order[a.sev] - order[b.sev]);
  const sr = res.sr, hiRes = sr > 48000, kHz = fmtKHz(cut.fc);
  if (!head) {
    const bad = F.find(f => f.sev === 'bad'), warn = F.find(f => f.sev === 'warn');
    if (bad) head = { grade: 'bad', label: 'Suspect', headline: bad.title, sub: bad.detail };
    else if (warn) head = { grade: 'warn', label: 'Caution', headline: warn.title, sub: warn.detail };
    else if (info.lossless == null) head = { grade: 'info', label: 'Unverified', headline: 'No lossy fingerprint, format unknown', sub: 'Content reaches ' + fmtKHz(Math.max(cut.fc, cut.fade)) + ' with no encoder wall, but the codec couldn’t be identified, so this isn’t proof the file is lossless.' };
    else if (info.lossless === false) head = { grade: 'warn', label: 'Lossy · not hi-res', headline: 'Lossy ' + info.codec + ', not hi-res', sub: 'Content stops at ' + kHz + '. The bandwidth matches what ' + info.codec + (info.bitrate ? ' at ' + Math.round(info.bitrate) + ' kbps' : '') + ' should give, so it isn’t a fake, but the encoder has removed detail and no sample rate can make it hi-res.' };
    else if (hiRes) head = { grade: 'ok', label: 'Genuine hi-res', headline: 'Real hi-res: content to ' + fmtKHz(Math.max(cut.fc, cut.fade)), sub: 'The spectrum extends well past what a CD or 48 kHz master can hold' + (depth && depth.eff >= 20 ? ', and the low bits carry signal.' : '.') };
    else if (!cut.full && cut.fc < 20800) head = { grade: 'ok', label: 'Lossless', headline: 'Genuine ' + fmtRate(sr) + ' lossless', sub: 'No lossy fingerprints. The top end rolls off gently from about ' + kHz + (cut.reach && cut.reach > cut.fc + 500 ? ', with quieter content up to ' + fmtKHz(cut.reach) : '') + ', as many masters do.' };
    else head = { grade: 'ok', label: 'Lossless', headline: 'Genuine ' + fmtRate(sr) + ' lossless', sub: 'Full bandwidth with no lossy fingerprints: what you’d expect from a proper CD rip or a lossless download.' };
  }
  const expected = info.lossless === true ? { hz: sr / 2, why: 'Nyquist limit' } : info.lossless === false ? expectedCutoff(info) : null;
  return { ...head, findings: F, cut, depth, bwTone, origin: origin || '—', expected };
}

export function declaredLabel(info: FileInfo): string {
  const parts = [info.codec];
  if (info.sampleRate) parts.push(fmtRate(info.sampleRate));
  if (info.lossless) parts.push(info.bitsLabel || (info.bits ? info.bits + '-bit' : '?-bit'));
  else if (info.bitrate) parts.push(Math.round(info.bitrate) + ' kbps');
  return parts.join(' · ');
}
