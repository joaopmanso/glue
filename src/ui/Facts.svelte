<script lang="ts">
  import { app } from '../lib/app.svelte';
  import { fmtBytes, fmtDb, fmtKHz, fmtRate, fmtTime } from '../core/format';

  const facts = $derived.by(() => {
    const info = app.info, res = app.res;
    if (!info || !res) return [] as [string, string][];
    const rows: ([string, string] | false | undefined | '' | 0)[] = [
      ['File', (info.fileName || '') + (info.fileSize ? ' · ' + fmtBytes(info.fileSize) : '')],
      ['Container', info.container],
      ['Codec', info.codec + (info.lossless === true ? ' (lossless)' : info.lossless === false ? ' (lossy)' : '')],
      ['Sample rate', info.sampleRate ? fmtRate(info.sampleRate) : '—'],
      ['Bit depth', info.bitsLabel || (info.bits ? info.bits + '-bit' : '—')],
      ['Channels', (info.channels || res.channels) + (info.channelMode ? ' · ' + info.channelMode : '')],
      ['Duration', fmtTime(info.duration || res.duration, true)],
      ['Bitrate', info.bitrate ? Math.round(info.bitrate) + ' kbps' + (info.bitrateMode ? ' · ' + info.bitrateMode : '') : info.nominalBitrate ? Math.round(info.nominalBitrate) + ' kbps nominal' : '—'],
      info.encoder && ['Encoder', info.encoder],
      info.vendor && ['Vendor', info.vendor],
      info.lameLowpass && ['LAME lowpass', fmtKHz(info.lameLowpass)],
      info.opusInputRate && ['Opus input rate', fmtRate(info.opusInputRate)],
      info.brand && ['MP4 brand', info.brand + (info.compatBrands ? ' (' + info.compatBrands.join(', ') + ')' : '')],
      ['Peak level', res.stats.peak > 0 ? fmtDb(20 * Math.log10(res.stats.peak)) + 'FS' : '—'],
      ['Analysis', 'FFT ' + res.N + ' pts · ' + res.binHz.toFixed(1) + ' Hz/bin · ' + res.cols + ' frames'],
      ...Object.entries(info.tags).slice(0, 16).map(([k, v]) => [k, String(v).slice(0, 240)] as [string, string]),
      ...info.notes.map(n => ['Note', n] as [string, string]),
    ];
    return rows.filter((r): r is [string, string] => Array.isArray(r));
  });
</script>

<section class="panel" aria-label="File details">
  <div class="panel-head"><h3>File details</h3><span class="hint">Read from the container header and tags</span></div>
  <div class="panel-body">
    <dl class="facts" id="facts">
      {#each facts as [k, v], i (i)}<div><dt>{k}</dt><dd>{v}</dd></div>{/each}
    </dl>
  </div>
</section>
