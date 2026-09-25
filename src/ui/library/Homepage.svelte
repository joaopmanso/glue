<script lang="ts">
  /* The start page for a new visitor: the product first. Real screenshots and clips of GLUE
     (public/home/, made by scripts/demo/capture.ts from a demo library), each next to what it does.
     Media loads as it scrolls into view; clips play only while visible; motion respects
     prefers-reduced-motion. */
  import CloudPanel from './CloudPanel.svelte';
  import GlueStick from '../GlueStick.svelte';

  const media = (f: string) => import.meta.env.BASE_URL + 'home/' + f;
  const start = (e: Event) => { e.preventDefault(); document.getElementById('get-started')?.scrollIntoView({ behavior: 'smooth' }); };

  /** Adds `.in` once the element scrolls into view (the CSS does the rest). */
  function reveal(el: HTMLElement) {
    if (!('IntersectionObserver' in window)) { el.classList.add('in'); return; }
    const io = new IntersectionObserver(es => { for (const e of es) if (e.isIntersecting) { el.classList.add('in'); io.disconnect(); } }, { rootMargin: '0px 0px -12% 0px' });
    io.observe(el);
    return { destroy: () => io.disconnect() };
  }
  /** A muted clip that loads and plays only while on screen. */
  function autoplay(v: HTMLVideoElement) {
    const io = new IntersectionObserver(es => { for (const e of es) { if (e.isIntersecting) { v.preload = 'auto'; void v.play().catch(() => {}); } else v.pause(); } }, { threshold: 0.35 });
    io.observe(v);
    return { destroy: () => io.disconnect() };
  }
  /** The hero frame tilts a little with the pointer and settles as the page scrolls. */
  function depth(el: HTMLElement) {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let rx = 0, ry = 0, raf = 0;
    const apply = () => { raf = 0; const s = Math.min(1, scrollY / 600); el.style.transform = `perspective(1600px) rotateX(${(6 - s * 6 + rx).toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateY(${(-s * 18).toFixed(1)}px)`; };
    const move = (e: PointerEvent) => { const r = el.getBoundingClientRect(); rx = ((e.clientY - r.top) / r.height - 0.5) * -3; ry = ((e.clientX - r.left) / r.width - 0.5) * 4; raf ||= requestAnimationFrame(apply); };
    const scroll = () => { raf ||= requestAnimationFrame(apply); };
    const host = el.closest('.hero') as HTMLElement;
    host.addEventListener('pointermove', move); addEventListener('scroll', scroll, { passive: true }); apply();
    return { destroy: () => { host.removeEventListener('pointermove', move); removeEventListener('scroll', scroll); cancelAnimationFrame(raf); } };
  }

  const headline = ['The', 'GLUE', 'between', 'your', 'DJ', 'apps.'];
  const chapters = [
    { n: '01', kind: 'image', file: 'library', title: 'Every library, one collection.', body: 'Bring in rekordbox, Engine DJ, Serato, Traktor and Apple Music, with their playlists, ratings and cue points, and link the folders your music lives in. GLUE reads your files where they are; it never moves or changes them.', points: ['A mini spectrogram on every row: click to play from that spot', 'Ratings in half stars, notes, tags, custom columns', 'Imported cue points and loops on the overview'] },
    { n: '02', kind: 'image', file: 'quality', title: 'Know what every file really is.', body: 'That "lossless" WAV from a promo pool? Its spectrum stops dead at 17.1 kHz, the wall a 128 kbps MP3 leaves behind. GLUE checks every track in the background and tells you, with the evidence.', points: ['Genuine, upsampled, transcoded, padded bits', 'Tempo and key for every track (Camelot, Open Key, musical)', 'Filter the library by quality before a gig'], note: 'wall at 17.1 kHz' },
    { n: '03', kind: 'video', file: 'clip-builder', title: 'Sets that mix, from one track.', body: 'Pick a track and GLUE builds a playlist along a tempo ramp, moving round the Camelot wheel and favouring your highest-rated music, with a little chance so every take is different.', points: ['Must-have tracks, start and end BPM, tags to prefer or avoid', 'See the tempo flow, keys and tag overlap before you save', 'Swap any slot, or ask for another take'] },
    { n: '04', kind: 'image', file: 'insights', title: 'Every playlist at a glance.', body: 'Length, tempo flow, how many transitions mix harmonically, the quality mix, and a Venn of the tags inside. Tag tracks and playlists, then filter, search and build by them.', points: ['Tags found in your files: Grouping, #hashtags, rekordbox My Tags', 'Drag tracks onto a tag or a playlist', 'Folders, colours, custom order'] },
  ];
  const duos = [
    { file: 'duplicates', title: 'Duplicates, by sound', body: 'The same recording under any name or format, found by listening. Keep the best copy.' },
    { file: 'filter', title: 'Filter what matters', body: 'Every value of quality, format, tags or genre, one click from the column header.' },
  ];
</script>

<div class="hp" id="homepage">
  <!-- Soft colour fields behind the page, so it isn't flat black -->
  <div class="bg" aria-hidden="true">
    <i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="b5"></i><i class="b6"></i><i class="b7"></i>
  </div>
  <!-- Hero: the product itself -->
  <section class="hero">
    <div class="hero-text">
      <p class="eyebrow"><GlueStick size={22} /> Global Library Unified Exporter</p>
      <h2 class="h1" aria-label="The GLUE between your DJ apps.">
        {#each headline as w, i (i)}<span class="w" class:accent={w === 'GLUE'} style:--d={i * 70 + 'ms'}>{w}</span>{i === 2 ? '' : ' '}{#if i === 2}<br>{/if}{/each}
      </h2>
      <div class="hero-row">
        <p class="lede">A music library for DJs that runs in your browser. It reads every DJ app's collection, checks the real quality of every file, and builds sets that mix, without uploading a single track.</p>
        <div class="hero-act">
          <div class="cta">
            <a class="btn big" href="#get-started" id="get-started-btn" onclick={start}>Get started, free</a>
            <a class="ghost" href="#/analyze">Check one file first <span aria-hidden="true">→</span></a>
          </div>
          <p class="works"><span>Reads</span> rekordbox <i></i> Engine DJ <i></i> Serato <i></i> Traktor <i></i> Apple Music</p>
        </div>
      </div>
    </div>
    <div class="frame hero-frame" use:depth>
      <video class="media" muted loop playsinline autoplay poster={media('clip-library-poster.webp')} aria-label="GLUE playing a track from its mini spectrogram">
        <source src={media('clip-library.mp4')} type="video/mp4">
      </video>
    </div>
  </section>

  <!-- Chapters -->
  {#each chapters as c, i (c.n)}
    <section class="chapter" class:flip={i % 2 === 1} use:reveal>
      <div class="copy">
        <span class="num">{c.n}</span>
        <h3>{c.title}</h3>
        <p>{c.body}</p>
        <ul>{#each c.points as p (p)}<li>{p}</li>{/each}</ul>
      </div>
      <figure class="frame">
        {#if c.kind === 'video'}
          <video class="media" muted loop playsinline preload="none" poster={media(c.file + '-poster.webp')} use:autoplay aria-label={c.title}><source src={media(c.file + '.mp4')} type="video/mp4"></video>
        {:else}
          <img class="media" src={media(c.file + '.webp')} alt={c.title} loading="lazy" decoding="async" width="2880" height="1800">
        {/if}
        {#if c.note}<span class="callout">{c.note}</span>{/if}
      </figure>
    </section>
  {/each}

  <section class="duo" use:reveal>
    {#each duos as d (d.file)}
      <figure class="tile">
        <div class="frame small"><img class="media" src={media(d.file + '.webp')} alt={d.title} loading="lazy" decoding="async"></div>
        <figcaption><b>{d.title}.</b> {d.body}</figcaption>
      </figure>
    {/each}
  </section>

  <!-- Live view, wide -->
  <section class="wide" use:reveal>
    <div class="copy center">
      <span class="num">05</span>
      <h3>See the music as it plays.</h3>
      <p>A full spectrogram, the average spectrum, the evidence behind every verdict, and a live 3D view running into the distance. Split any track into drums, bass, other and vocals, right in the browser.</p>
    </div>
    <figure class="frame">
      <video class="media" muted loop playsinline preload="none" poster={media('clip-live-poster.webp')} use:autoplay aria-label="The live 3D spectrum while a track plays"><source src={media('clip-live.mp4')} type="video/mp4"></video>
    </figure>
  </section>

  <!-- Every computer -->
  <section class="cloud" use:reveal>
    <div class="copy">
      <span class="num">06</span>
      <h3>One account, every computer.</h3>
      <p>Optional. Sign in and your collections' data (never the music) follows you: open your desktop's library from the laptop, merge both into one, and edits made anywhere reach the computer that owns the files.</p>
      <ul><li>Google or email sign-in</li><li>Merged collections across devices</li><li>Delete everything in the cloud with one click</li></ul>
    </div>
    <div class="devices" aria-hidden="true">
      <div class="dev"><b>Laptop</b><span>My collection · 1,204</span></div>
      <div class="dev"><b>Desktop</b><span>My collection · 8,913</span></div>
      <div class="link"><span></span><span></span></div>
      <div class="dev merged"><b>My collection</b><span>merged · 9,540 tracks</span></div>
    </div>
    <div class="cloud-panel"><CloudPanel /></div>
  </section>

</div>

<style>
  .hp { --gap: clamp(72px, 11vw, 150px); display: grid; gap: var(--gap); margin-bottom: 48px; }
  /* Hero */
  .hero { display: grid; gap: clamp(34px, 5vw, 64px); padding-top: clamp(8px, 3vh, 40px); }
  .hero-row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 28px 56px; align-items: end; }
  .hero-act { display: grid; gap: 18px; justify-items: start; }
  .eyebrow { display: flex; align-items: center; gap: 10px; font: 600 12px var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .h1 { font-size: clamp(40px, 7.4vw, 112px); line-height: .95; letter-spacing: -.04em; font-weight: 850; margin: 20px 0 28px; }
  .w { display: inline-block; opacity: 0; transform: translateY(.35em); animation: rise .7s cubic-bezier(.2, .7, .2, 1) forwards; animation-delay: var(--d); }
  .w.accent { color: var(--accent); }
  @keyframes rise { to { opacity: 1; transform: none; } }
  .lede { font-size: clamp(16px, 1.35vw, 19px); line-height: 1.55; color: var(--ink-2); max-width: 36em; opacity: 0; animation: rise .7s .45s ease forwards; }
  .cta { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; opacity: 0; animation: rise .7s .6s ease forwards; }
  .btn.big { padding: 13px 24px; font-size: 16px; text-decoration: none; display: inline-flex; align-items: center; border-radius: 10px; }
  .ghost { color: var(--ink); text-decoration: none; font-weight: 600; border-bottom: 1px solid var(--line-2); padding-bottom: 2px; }
  .ghost:hover { border-color: var(--accent); color: var(--accent); }
  .ghost span { display: inline-block; transition: transform .2s; }
  .ghost:hover span { transform: translateX(3px); }
  .works { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; color: var(--ink-2); font-size: 13.5px; opacity: 0; animation: rise .7s .75s ease forwards; }
  .works span { font: 600 11px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
  .works i { width: 3px; height: 3px; border-radius: 50%; background: var(--line-2); }
  /* Media frames: the product, not a mock-up */
  .frame { position: relative; margin: 0; border-radius: 14px; overflow: hidden; background: var(--surface); border: 1px solid var(--line-2); box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 6%, transparent) inset, 0 30px 80px -20px rgb(0 0 0 / .55), 0 12px 24px -12px rgb(0 0 0 / .4); }
  .frame .media { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top left; background: var(--ground); }
  .hero-frame { transform-origin: 50% 0%; transition: transform .25s ease-out; opacity: 0; animation: arrive 1s .25s cubic-bezier(.2, .7, .2, 1) forwards; will-change: transform; }
  @keyframes arrive { from { opacity: 0; translate: 0 40px; scale: .97; } to { opacity: 1; translate: 0 0; scale: 1; } }
  /* Colour fields: soft blocks of colour behind the sections, drifting slowly */
  .hp { position: relative; isolation: isolate; }
  :global(html:has(#homepage)) { overflow-x: clip; }
  .bg { position: absolute; z-index: -1; top: -12vh; bottom: -20vh; left: 50%; width: 100vw; margin-left: -50vw; overflow: hidden; pointer-events: none; }
  .bg i { position: absolute; display: block; border-radius: 50%; opacity: var(--o, .22); background: radial-gradient(closest-side, var(--c) 0%, color-mix(in srgb, var(--c) 55%, transparent) 38%, color-mix(in srgb, var(--c) 18%, transparent) 70%, transparent 100%); animation: drift var(--t, 26s) ease-in-out infinite alternate; }
  .b1 { --c: var(--accent); --o: .17; width: 70vw; height: 56vw; max-height: 1000px; top: -6%; right: -14vw; }
  .b2 { --c: #ff5a2e; --o: .13; --t: 31s; width: 60vw; height: 48vw; top: 6%; left: -12vw; }
  .b3 { --c: #8b3dff; --o: .16; --t: 28s; width: 66vw; height: 52vw; top: 22%; right: -10vw; }
  .b4 { --c: #e0337a; --o: .12; --t: 34s; width: 62vw; height: 50vw; top: 38%; left: -10vw; }
  .b5 { --c: #18b8a6; --o: .13; --t: 29s; width: 64vw; height: 50vw; top: 54%; right: -12vw; }
  .b6 { --c: var(--accent); --o: .12; --t: 33s; width: 66vw; height: 52vw; top: 70%; left: -12vw; }
  .b7 { --c: #3d7bff; --o: .14; --t: 27s; width: 66vw; height: 52vw; top: 84%; right: -10vw; }
  @keyframes drift { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(4vw, -3vw, 0) scale(1.08); } }
  :global([data-mode="light"]) .bg i { opacity: calc(var(--o, .22) * 1.5); mix-blend-mode: multiply; }
  /* Chapters */
  .chapter { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.3fr); gap: clamp(28px, 5vw, 80px); align-items: center; }
  .chapter.flip { grid-template-columns: minmax(0, 1.3fr) minmax(0, .8fr); }
  .chapter.flip .copy { order: 2; }
  .copy { display: grid; gap: 14px; align-content: start; }
  .copy.center { text-align: center; justify-items: center; max-width: 720px; margin: 0 auto; }
  .num { font: 600 12px var(--font-mono); color: var(--accent); letter-spacing: .14em; }
  .copy h3 { font-size: clamp(28px, 3.2vw, 44px); line-height: 1.05; letter-spacing: -.025em; font-weight: 800; }
  .copy p { color: var(--ink-2); font-size: 16px; line-height: 1.6; }
  .copy ul { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 9px; }
  .copy li { display: flex; gap: 10px; color: var(--ink-2); font-size: 14.5px; line-height: 1.45; }
  .copy li::before { content: ''; flex: none; width: 14px; height: 2px; margin-top: .7em; background: var(--accent); }
  .callout { position: absolute; left: 36%; top: 21%; font: 600 12px var(--font-mono); background: var(--accent); color: var(--accent-ink); padding: 5px 10px; border-radius: 6px; box-shadow: 0 8px 20px rgb(0 0 0 / .35); opacity: 0; transform: translateY(8px); transition: opacity .5s .5s, transform .5s .5s; }
  .chapter:global(.in) .callout { opacity: 1; transform: none; }
  /* Two tiles */
  .duo { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(20px, 3vw, 40px); }
  .tile { margin: 0; display: grid; gap: 14px; }
  .tile figcaption { color: var(--ink-2); font-size: 15px; line-height: 1.5; }
  .tile figcaption b { color: var(--ink); }
  .frame.small .media { aspect-ratio: auto; }
  /* Wide */
  .wide { display: grid; gap: 34px; }
  /* Cloud */
  .cloud { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 28px clamp(28px, 5vw, 80px); align-items: center; }
  .cloud-panel { grid-column: 1 / -1; }
  .devices { position: relative; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding: 10px; }
  .dev { background: var(--surface); border: 1px solid var(--line-2); border-radius: 12px; padding: 16px; display: grid; gap: 4px; }
  .dev b { font-size: 16px; }
  .dev span { color: var(--muted); font-size: 13px; font-family: var(--font-mono); }
  .dev.merged { grid-column: 1 / -1; justify-self: center; min-width: 60%; border-color: var(--accent); box-shadow: 0 0 0 4px color-mix(in srgb, var(--accent) 14%, transparent); margin-top: 46px; }
  .link { position: absolute; left: 25%; right: 25%; top: 88px; height: 46px; pointer-events: none; }
  .link span { position: absolute; top: 0; width: 50%; height: 100%; border-bottom: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent); }
  .link span:first-child { left: 0; border-left: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent); border-bottom-left-radius: 14px; }
  .link span:last-child { right: 0; border-right: 2px dashed color-mix(in srgb, var(--accent) 60%, transparent); border-bottom-right-radius: 14px; }
  /* (the setup below the page is the final call) */
  /* Scroll reveal */
  :global(.hp [class*="chapter"]), .duo, .wide, .cloud { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(.2, .7, .2, 1), transform .8s cubic-bezier(.2, .7, .2, 1); }
  .chapter .frame { transform: translateX(28px) scale(.985); transition: transform 1s cubic-bezier(.2, .7, .2, 1); }
  .chapter.flip .frame { transform: translateX(-28px) scale(.985); }
  :global(.hp .in) { opacity: 1 !important; transform: none !important; }
  :global(.hp .in) .frame { transform: none; }
  @media (prefers-reduced-motion: reduce) {
    .w, .lede, .cta, .works, .hero-frame, .bg i { animation: none; opacity: 1; transform: none; }
    :global(.hp [class*="chapter"]), .duo, .wide, .cloud, .chapter .frame, .callout { opacity: 1; transform: none; transition: none; }
  }
  @media (max-width: 900px) {
    .hero-row, .chapter, .chapter.flip, .cloud, .duo { grid-template-columns: 1fr; }
    .chapter.flip .copy { order: 0; }
  }
</style>
