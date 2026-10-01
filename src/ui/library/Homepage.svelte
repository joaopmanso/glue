<script lang="ts">
  /* The start page for a new visitor (ADR 0126, batch 3): what GLUE is, how it starts, and four things it does, each
     with a real picture or clip of the app (public/home/, made by scripts/demo/capture.ts from a demo library).
     Gluey introduces it. Media loads as it scrolls into view; clips play only while visible; motion respects
     prefers-reduced-motion. The setup form (#get-started) follows it. */
  import CloudPanel from './CloudPanel.svelte';
  import Gluey from '../guide/Gluey.svelte';
  import { HOME_DOWNLOADS, homeOs } from '../../lib/homeApp';

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
  const os = homeOs();
  const steps = [
    { n: '1', title: 'Choose where GLUE keeps its data', body: 'A folder on your computer. Your library is plain files you own: back it up or move it like any folder.' },
    { n: '2', title: 'Add your music and DJ libraries', body: 'Your music folders, and rekordbox, Engine DJ, Serato, Traktor or Apple Music with their playlists, ratings and cues.' },
    { n: '3', title: 'Add GLUE Home, if you like', body: 'A small app for your computer: analysis with the browser closed, your songs on your laptop and phone, the drag dock.' },
  ];
  type Shot = { file: string; alt: string; video?: boolean };
  const sections: { n: string; title: string; body: string; points: string[]; main: Shot; side?: Shot[]; help: string }[] = [
    {
      n: '01', title: 'One library from every DJ app.', help: 'dj-libraries',
      body: 'Your music folders and your DJ apps’ libraries, together: playlists, ratings, cues and tags. GLUE reads your files where they are and never writes into another app’s library; when your DJ app changes, GLUE follows.',
      points: ['rekordbox, Engine DJ (every drive), Serato, Traktor, Apple Music, M3U', 'Browse by artist, album, genre, label or year; search and filter anything', 'Network folders and drives that come and go are fine'],
      main: { file: 'insights.webp', alt: 'A playlist in GLUE with its insights: length, tempo, keys, quality and tags' },
    },
    {
      n: '02', title: 'Know what you really have.', help: 'quality',
      body: 'Every file is listened to: is that “lossless” WAV really an MP3? Duplicates are found by how they sound, and each song shows as its best copy. Songs your DJ library lists but can’t find are matched to the ones you have.',
      points: ['Lossless, genuine hi-res, transcoded, upsampled, with the evidence', 'Duplicates by sound; keep the best copy, clean up the rest in bulk', '“No file linked” songs found in your library, with how sure GLUE is'],
      main: { file: 'quality.webp', alt: 'A file’s verdict: a transcode, its spectrum stopping at 17.2 kHz' },
      side: [{ file: 'duplicates.webp', alt: 'Duplicates found by sound, with the best copy' }, { file: 'relink.webp', alt: 'Songs with no file matched to the library’s, with a certainty' }],
    },
    {
      n: '03', title: 'Ready for the gig.', help: 'prepare',
      body: 'Check the beat grid and set cues before a set, build a playlist that flows from one track, and keep your gigs with their music. With GLUE Home, the drag dock carries songs straight into Engine DJ or rekordbox.',
      points: ['Prepare: the grid, the metronome, cues and loops', 'A playlist that flows by tempo and key, from any song', 'A calendar of your gigs, with a reminder when one has no music yet'],
      main: { file: 'prepare.webp', alt: 'Prepare: a song’s waveform with its beat grid and cues' },
      side: [{ file: 'clip-builder.mp4', alt: 'Building a playlist from a track', video: true }, { file: 'calendar.webp', alt: 'The calendar with a gig and its playlist' }],
    },
  ];
</script>

<div class="hp" id="homepage">
  <!-- Soft colour fields behind the page, so it isn't flat black -->
  <div class="bg" aria-hidden="true"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b4"></i><i class="b5"></i></div>

  <!-- Hero: Gluey, the promise, the product -->
  <section class="hero">
    <div class="hero-head">
      <div>
        <p class="eyebrow">Global Library Unified Exporter</p>
        <h2 class="h1" aria-label="The GLUE between your DJ apps.">
          {#each headline as w, i (i)}<span class="w" class:accent={w === 'GLUE'} style:--d={i * 70 + 'ms'}>{w}</span>{i === 2 ? '' : ' '}{#if i === 2}<br>{/if}{/each}
        </h2>
      </div>
      <div class="hero-gluey" aria-hidden="true">
        <span class="say">Hi, I’m Gluey!<br>I’ll show you around.</span>
        <Gluey size={170} pose="wave" />
      </div>
    </div>
    <div class="hero-row">
      <p class="lede">A music library for DJs that runs in your browser. It brings every DJ app’s collection together, checks the real quality of every file, finds duplicates by sound and gets you ready for the gig, without uploading a single track.</p>
      <div class="hero-act">
        <div class="cta">
          <a class="btn big" href="#get-started" id="get-started-btn" onclick={start}>Get started, free</a>
          <a class="ghost" href="#/analyze">Check one file first <span aria-hidden="true">→</span></a>
          <a class="ghost" href="#/help/getting-started" id="hp-help">How it works</a>
        </div>
        <p class="works"><span>Reads</span> rekordbox <i></i> Engine DJ <i></i> Serato <i></i> Traktor <i></i> Apple Music</p>
      </div>
    </div>
    <div class="frame hero-frame" use:depth>
      <video class="media" muted loop playsinline autoplay poster={media('clip-library-poster.webp')} aria-label="GLUE playing a track from its mini spectrogram">
        <source src={media('clip-library.mp4')} type="video/mp4">
      </video>
    </div>
  </section>

  <!-- How it starts -->
  <section class="how" use:reveal id="hp-how">
    <h3>How it starts</h3>
    <ol class="steps">
      {#each steps as s (s.n)}<li><b class="sn">{s.n}</b><div><h4>{s.title}</h4><p>{s.body}</p></div></li>{/each}
    </ol>
    <p class="need"><b>What you need:</b> Chrome or Edge on a computer. Your phone joins through your account. GLUE Home is for
      {#each Object.entries(HOME_DOWNLOADS) as [k, d], i (k)}{i ? ' and ' : ''}<a href={d.url} class:mine={os === k}>{d.label}</a>{/each}.</p>
  </section>

  {#each sections as c, i (c.n)}
    <section class="chapter" class:flip={i % 2 === 1} use:reveal>
      <div class="copy">
        <span class="num">{c.n}</span>
        <h3>{c.title}</h3>
        <p>{c.body}</p>
        <ul>{#each c.points as p (p)}<li>{p}</li>{/each}</ul>
        <a class="more" href={'#/help/' + c.help}>More in the help <span aria-hidden="true">→</span></a>
      </div>
      <div class="pics">
        <figure class="frame"><img class="media" src={media(c.main.file)} alt={c.main.alt} loading="lazy" decoding="async" width="2880" height="1800"></figure>
        {#if c.side}
          <div class="side">
            {#each c.side as s (s.file)}
              <figure class="frame small">
                {#if s.video}<video class="media" muted loop playsinline preload="none" poster={media(s.file.replace('.mp4', '-poster.webp'))} use:autoplay aria-label={s.alt}><source src={media(s.file)} type="video/mp4"></video>
                {:else}<img class="media" src={media(s.file)} alt={s.alt} loading="lazy" decoding="async">{/if}
              </figure>
            {/each}
          </div>
        {/if}
      </div>
    </section>
  {/each}

  <!-- Every device; the music stays yours -->
  <section class="devices-sec" use:reveal>
    <div class="copy">
      <span class="num">04</span>
      <h3>Every device. Your music stays yours.</h3>
      <p>Sign in (optional) and your library is on your laptop and phone too. Songs play straight from the computer that has them, through GLUE Home: no GLUE server ever sees your music.</p>
      <ul><li>GLUE Home: the background engine on your computer</li><li>Your phone: browse, play, rate, make playlists</li><li>Profiles are your artist names, the same everywhere</li></ul>
      <a class="more" href="#/help/devices">More in the help <span aria-hidden="true">→</span></a>
    </div>
    <figure class="phone"><img src={media('phone.webp')} alt="GLUE on a phone" loading="lazy" decoding="async"></figure>
    <div class="cloud-panel"><CloudPanel /></div>
  </section>

  <!-- The end: Gluey again -->
  <section class="end" use:reveal>
    <Gluey size={92} pose="cheer" />
    <div>
      <h3>Ready when you are.</h3>
      <p>Setting up takes a minute, and I’ll show you around once you’re in.</p>
    </div>
    <div class="cta"><a class="btn big" href="#get-started" onclick={start}>Get started, free</a><a class="ghost" href="#/help">Help</a></div>
  </section>
</div>

<style>
  .hp { --gap: clamp(64px, 9vw, 130px); display: grid; gap: var(--gap); margin-bottom: 48px; position: relative; isolation: isolate; }
  /* Hero */
  .hero { display: grid; gap: clamp(28px, 4vw, 52px); padding-top: clamp(8px, 3vh, 40px); }
  .hero-head { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 24px; }
  .hero-row { display: grid; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); gap: 28px 56px; align-items: end; }
  .hero-gluey { position: relative; display: grid; justify-items: center; gap: 6px; opacity: 0; animation: arrive 1s .35s cubic-bezier(.2, .7, .2, 1) forwards; }
  .hero-gluey::before { content: ''; position: absolute; inset: 10% -10% -10%; border-radius: 50%; background: radial-gradient(closest-side, color-mix(in srgb, var(--accent) 34%, transparent), transparent); z-index: -1; }
  .say { position: relative; background: var(--surface); border: 1px solid var(--accent); border-radius: 14px; padding: 8px 14px; font-weight: 600; font-size: 14px; text-align: center; line-height: 1.35; box-shadow: 0 10px 28px rgb(0 0 0 / .35); }
  .say::after { content: ''; position: absolute; left: 50%; bottom: -7px; width: 12px; height: 12px; background: var(--surface); border-right: 1px solid var(--accent); border-bottom: 1px solid var(--accent); transform: translateX(-50%) rotate(45deg); }
  .eyebrow { font: 600 12px var(--font-mono); letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
  .h1 { font-size: clamp(40px, 7.4vw, 112px); line-height: .95; letter-spacing: -.04em; font-weight: 850; margin: 20px 0 8px; }
  .w { display: inline-block; opacity: 0; transform: translateY(.35em); animation: rise .7s cubic-bezier(.2, .7, .2, 1) forwards; animation-delay: var(--d); }
  .w.accent { color: var(--accent); }
  @keyframes rise { to { opacity: 1; transform: none; } }
  .lede { font-size: clamp(16px, 1.35vw, 19px); line-height: 1.55; color: var(--ink-2); max-width: 36em; margin: 0; opacity: 0; animation: rise .7s .45s ease forwards; }
  .hero-act { display: grid; gap: 18px; justify-items: start; }
  .cta { display: flex; gap: 22px; align-items: center; flex-wrap: wrap; opacity: 0; animation: rise .7s .6s ease forwards; }
  .btn.big { padding: 13px 24px; font-size: 16px; text-decoration: none; display: inline-flex; align-items: center; border-radius: 10px; }
  .ghost, .more { color: var(--ink); text-decoration: none; font-weight: 600; border-bottom: 1px solid var(--line-2); padding-bottom: 2px; }
  .ghost:hover, .more:hover { border-color: var(--accent); color: var(--accent); }
  .more { justify-self: start; font-size: 14px; }
  .works { display: flex; flex-wrap: wrap; gap: 6px 12px; align-items: center; color: var(--ink-2); font-size: 13.5px; margin: 0; opacity: 0; animation: rise .7s .75s ease forwards; }
  .works span { font: 600 11px var(--font-mono); letter-spacing: .12em; text-transform: uppercase; color: var(--muted); margin-right: 4px; }
  .works i { width: 3px; height: 3px; border-radius: 50%; background: var(--line-2); }
  /* Media frames: the product, not a mock-up */
  .frame { position: relative; margin: 0; border-radius: 14px; overflow: hidden; background: var(--surface); border: 1px solid var(--line-2); box-shadow: 0 1px 0 color-mix(in srgb, var(--ink) 6%, transparent) inset, 0 30px 80px -20px rgb(0 0 0 / .55), 0 12px 24px -12px rgb(0 0 0 / .4); }
  .frame .media { display: block; width: 100%; height: auto; aspect-ratio: 16 / 10; object-fit: cover; object-position: top left; background: var(--ground); }
  .hero-frame { transform-origin: 50% 0%; transition: transform .25s ease-out; opacity: 0; animation: arrive 1s .25s cubic-bezier(.2, .7, .2, 1) forwards; will-change: transform; }
  @keyframes arrive { from { opacity: 0; translate: 0 40px; scale: .97; } to { opacity: 1; translate: 0 0; scale: 1; } }
  /* How it starts */
  .how { display: grid; gap: 18px; }
  .how h3, .end h3 { font-size: clamp(26px, 2.8vw, 38px); letter-spacing: -.02em; font-weight: 800; margin: 0; }
  .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
  .steps li { display: flex; gap: 14px; background: var(--surface); border: 1px solid var(--line-2); border-radius: 14px; padding: 18px; }
  .sn { flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--accent); color: var(--accent-ink); font-size: 16px; }
  .steps h4 { margin: 4px 0 6px; font-size: 16px; color: var(--ink); }
  .steps p { margin: 0; color: var(--ink-2); font-size: 14px; line-height: 1.5; }
  .need { margin: 0; color: var(--ink-2); font-size: 14px; }
  .need a { color: var(--ink); }
  .need a.mine { color: var(--accent); font-weight: 600; }
  /* Colour fields: soft blocks of colour behind the sections, drifting slowly */
  :global(html:has(#homepage)) { overflow-x: clip; }
  .bg { position: absolute; z-index: -1; top: -12vh; bottom: -20vh; left: 50%; width: 100vw; margin-left: -50vw; overflow: hidden; pointer-events: none; }
  .bg i { position: absolute; display: block; border-radius: 50%; opacity: var(--o, .22); background: radial-gradient(closest-side, var(--c) 0%, color-mix(in srgb, var(--c) 55%, transparent) 38%, color-mix(in srgb, var(--c) 18%, transparent) 70%, transparent 100%); animation: drift var(--t, 26s) ease-in-out infinite alternate; }
  .b1 { --c: var(--accent); --o: .17; width: 70vw; height: 56vw; max-height: 1000px; top: -6%; right: -14vw; }
  .b2 { --c: #ff5a2e; --o: .13; --t: 31s; width: 60vw; height: 48vw; top: 14%; left: -12vw; }
  .b3 { --c: #8b3dff; --o: .16; --t: 28s; width: 66vw; height: 52vw; top: 36%; right: -10vw; }
  .b4 { --c: #18b8a6; --o: .13; --t: 29s; width: 64vw; height: 50vw; top: 58%; left: -12vw; }
  .b5 { --c: #3d7bff; --o: .14; --t: 27s; width: 66vw; height: 52vw; top: 80%; right: -10vw; }
  @keyframes drift { from { transform: translate3d(0, 0, 0) scale(1); } to { transform: translate3d(4vw, -3vw, 0) scale(1.08); } }
  :global([data-mode="light"]) .bg i { opacity: calc(var(--o, .22) * 1.5); mix-blend-mode: multiply; }
  /* Chapters */
  .chapter { display: grid; grid-template-columns: minmax(0, .8fr) minmax(0, 1.3fr); gap: clamp(28px, 5vw, 80px); align-items: center; }
  .chapter.flip { grid-template-columns: minmax(0, 1.3fr) minmax(0, .8fr); }
  .chapter.flip .copy { order: 2; }
  .copy { display: grid; gap: 14px; align-content: start; }
  .num { font: 600 12px var(--font-mono); color: var(--accent); letter-spacing: .14em; }
  .copy h3 { font-size: clamp(28px, 3.2vw, 44px); line-height: 1.05; letter-spacing: -.025em; font-weight: 800; margin: 0; }
  .copy p { color: var(--ink-2); font-size: 16px; line-height: 1.6; margin: 0; }
  .copy ul { list-style: none; margin: 4px 0 0; padding: 0; display: grid; gap: 9px; }
  .copy li { display: flex; gap: 10px; color: var(--ink-2); font-size: 14.5px; line-height: 1.45; }
  .copy li::before { content: ''; flex: none; width: 14px; height: 2px; margin-top: .7em; background: var(--accent); }
  .pics { display: grid; gap: 16px; }
  .side { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
  .frame.small .media { aspect-ratio: 16 / 10; }
  /* Devices */
  .devices-sec { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 28px clamp(28px, 5vw, 80px); align-items: center; }
  .phone { margin: 0; width: clamp(200px, 22vw, 290px); border-radius: 30px; overflow: hidden; border: 6px solid color-mix(in srgb, var(--ink) 14%, var(--surface)); box-shadow: 0 30px 70px -20px rgb(0 0 0 / .6); }
  .phone img { display: block; width: 100%; height: auto; }
  .cloud-panel { grid-column: 1 / -1; }
  /* The end */
  .end { display: grid; grid-template-columns: auto 1fr auto; gap: 24px; align-items: center; background: var(--surface); border: 1px solid var(--line-2); border-radius: 18px; padding: 24px 28px; }
  .end p { margin: 6px 0 0; color: var(--ink-2); }
  .end .cta { opacity: 1; animation: none; }
  /* Scroll reveal */
  .how, .chapter, .devices-sec, .end { opacity: 0; transform: translateY(28px); transition: opacity .8s cubic-bezier(.2, .7, .2, 1), transform .8s cubic-bezier(.2, .7, .2, 1); }
  :global(.hp .in) { opacity: 1 !important; transform: none !important; }
  @media (prefers-reduced-motion: reduce) {
    .w, .lede, .cta, .works, .hero-frame, .hero-gluey, .bg i { animation: none; opacity: 1; transform: none; }
    .how, .chapter, .devices-sec, .end { opacity: 1; transform: none; transition: none; }
  }
  @media (max-width: 900px) {
    .hero-head { grid-template-columns: minmax(0, 1fr) 110px; gap: 12px; align-items: start; }
    .hero-gluey :global(svg) { width: 100px; height: auto; }
    .say { font-size: 12px; padding: 6px 8px; }
    .hero-row, .chapter, .chapter.flip, .devices-sec, .steps, .end { grid-template-columns: 1fr; }
    .chapter.flip .copy { order: 0; }
    .phone { justify-self: center; }
    .end { justify-items: start; }
  }
</style>
