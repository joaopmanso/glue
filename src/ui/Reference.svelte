<script lang="ts"></script>

<details class="ref">
  <summary>How the verdict is reached</summary>
  <div class="inner">
    <p>Every lossy encoder throws away the top of the spectrum with a steep lowpass filter, and every sample-rate converter leaves nothing above the source’s Nyquist limit (half its sample rate). Converting to FLAC, WAV or a higher sample rate can’t bring that content back, so the wall stays visible. MCO averages the spectrum over the whole track, finds where the content stops and how steeply, and compares that against what the declared format should hold. It also checks whether the low bits of 24-bit files carry anything, and reads the container for encoder and downloader fingerprints.</p>
    <div class="table-wrap">
      <table>
        <thead><tr><th>Where content stops</th><th>Usual source</th></tr></thead>
        <tbody>
          <tr><td>≈ 11 kHz</td><td>Very low bitrate lossy (≤ 64 kbps) or a 22 kHz source</td></tr>
          <tr><td>≈ 15–16 kHz</td><td>128 kbps AAC/MP3: YouTube’s AAC stream (format 140), SoundCloud, older FhG MP3s</td></tr>
          <tr><td>≈ 17 kHz</td><td>MP3 128–160 kbps (LAME)</td></tr>
          <tr><td>≈ 18.6 kHz</td><td>MP3/AAC ≈ 192 kbps</td></tr>
          <tr><td>≈ 19.5 kHz</td><td>MP3 224–256 kbps or LAME V0; AAC 256 (iTunes / Apple Music)</td></tr>
          <tr><td>20.0 kHz, razor sharp</td><td>Opus: YouTube’s Opus stream (format 251)</td></tr>
          <tr><td>≈ 20.5 kHz</td><td>MP3 320 kbps (LAME)</td></tr>
          <tr><td>21–22 kHz</td><td>CD / 44.1 kHz master; in a 96 or 192 kHz file it means upsampled from 44.1</td></tr>
          <tr><td>≈ 23–24 kHz</td><td>48 kHz master; in a hi-res file it means upsampled from 48</td></tr>
          <tr><td>well past 24 kHz</td><td>Genuine hi-res content</td></tr>
        </tbody>
      </table>
    </div>
    <p>Limits: a steep 20 kHz lowpass can also come from mastering, and a 16-bit source that had gain or dither applied after conversion fills all 24 bits. Treat a Caution as “look closer”, and a Fail as strong evidence.</p>
  </div>
</details>
