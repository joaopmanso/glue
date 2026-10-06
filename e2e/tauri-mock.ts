/* A stand-in for GLUE Home's Rust side (home/src-tauri) in the browser, so its real settings and
   service pages run in tests: Tauri's IPC bridge, events between the two windows (a
   BroadcastChannel), the settings file (localStorage), the incoming folder (in memory), the plugins. */
export const TAURI_MOCK = `(() => {
  const label = location.pathname.includes('service') ? 'service' : 'settings';
  const bc = new BroadcastChannel('glue-home-mock');
  const cbs = new Map(); let next = 1;
  const listeners = [];
  const files = window.__files = []; const log = window.__calls = []; const cache = window.__cache = {};
  const deliver = m => { if (m.target && m.target !== label) return; for (const l of listeners) if (l.event === m.event) cbs.get(l.id)?.({ event: m.event, id: 0, payload: m.payload }); };
  // Like Tauri's IPC, everything crosses as JSON.
  const send = (event, payload, target) => { const m = { event, payload: payload === undefined ? null : JSON.parse(JSON.stringify(payload)), target }; bc.postMessage(m); deliver(m); };
  bc.onmessage = e => deliver(e.data);
  // Tests deliver Rust's events (e.g. the local link's /attach, ADR 0091) with this.
  window.__tauriEvent = (event, payload) => deliver({ event, payload, target: undefined });
  const cfg = () => JSON.parse(localStorage.getItem('home-config') || 'null');
  // GLUE Home's library engine (ADR 0153, 0154): the real one, run by the test's FakeHome (e2e/fakeHome.ts), reached over
  // its local link (/engine); what it says comes back as GLUE Home's events. It analyses this computer's songs, real
  // files on disk. No FakeHome: no engine.
  // Only a test's FakeHome (port 47450 and up), never a real GLUE Home on this computer (47400–47409). Its engine's
  // address (window.__enginePort, or its local link's when the test's GLUE Home is the FakeHome): a test can stand the
  // local link in itself (port 47400) and still have the engine.
  const enginePort = () => window.__enginePort ?? window.__localPort;
  const fakeHome = (path, init) => enginePort() >= 47450 ? fetch('http://127.0.0.1:' + enginePort() + path + (path.includes('?') ? '&' : '?') + 't=' + encodeURIComponent(window.__homeToken ?? cfg()?.localToken ?? ''), init) : Promise.reject(new Error('no GLUE Home here'));
  const toEngine = async m => {
    const r = await fakeHome('/engine', { method: 'POST', body: JSON.stringify(m) });
    if (!r.ok) throw 'GLUE Home’s engine isn’t there';
    const a = await r.json();
    if (a.err !== undefined) throw a.err;
    return a.ok;
  };
  const settings = () => toEngine({ set: { config: cfg() ?? {}, port: window.__localPort ?? 47400 } }).catch(() => {});
  // To the engine, in order (what the room's socket and the connections said, the page's answers to its calls).
  let chain = Promise.resolve();
  const post = m => { chain = chain.then(() => fakeHome('/engine', { method: 'POST', body: JSON.stringify(m) })).catch(() => {}); return chain; };
  // The account's signaling room (ADR 0158): the engine's socket, opened here, so the test's routeWebSocket stands in for
  // GLUE Cloud's room as it did for the service page's own.
  const socks = {};
  const ws = n => {
    if (n.open !== undefined) {
      const w = socks[n.open] = new WebSocket(n.url); w.q = [];
      w.onopen = () => { for (const t of w.q) w.send(t); w.q = null; };
      w.onmessage = e => void post({ ws: n.open, text: String(e.data) });
      w.onclose = e => { delete socks[n.open]; void post({ ws: n.open, closed: e.code }); };
    } else if (n.send !== undefined) { const w = socks[n.send]; if (w?.q) w.q.push(n.text); else if (w?.readyState === 1) w.send(n.text); }
    else if (n.close !== undefined) { const w = socks[n.close]; delete socks[n.close]; if (w) { w.onclose = null; try { w.close(n.code >= 3000 ? n.code : 1000); } catch { w.close(); } } }
    return [];
  };
  // What the engine asks of the page: an offer answered by the connections here (e2e/home-rtc.ts); GLUE Cloud (when
  // the test's FakeHome doesn't answer it), with the test's routes standing in, as for the service page's own calls.
  const API = 'https://glue-api.joaopmanso.workers.dev';
  const answerCall = async n => {
    try {
      if (n.page?.peer === 'answer') { const p = n.page; return post({ reply: n.call, status: 200, body: await (await rtcE()).answer(p.id, p.sdp, p.servers, p.hello) }); }
      const c = n.cloud, r = await fetch((cfg()?.api || API) + c.path, { method: c.method, headers: c.type ? { 'Content-Type': c.type } : {}, body: c.body ?? undefined });
      return post({ reply: n.call, status: r.status, body: await r.text() });
    } catch (e) { return post({ reply: n.call, status: 500, body: String(e?.message ?? e) }); }
  };
  const peer = n => {
    void rtcE().then(r => n.op === 'ice' ? r.ice(n.id, n.candidate) : n.op === 'close' ? r.close(n.id) : r.tell(n.msg)).catch(() => {});
    return [];
  };
  let notesFrom = 0, notesOn = false;
  const NOTE = {
    event: n => ['engine-event', n.text], edited: n => ['engine-edited', { p: n.p, c: n.c, paths: n.paths }], changed: () => ['engine-changed', null],
    analysis: n => ['engine-analysis', n.state], background: n => ['engine-background', n.progress], room: n => ['engine-room', n.room],
    ws, peer, call: n => { void answerCall(n); return []; },
    // The engine changed the settings (a music folder it found, the pause): saved, and both windows told.
    config: n => { const c = { ...(cfg() ?? {}), ...n.patch }; localStorage.setItem('home-config', JSON.stringify(c)); send('config', c); return []; },
    // A search of the drives for a music folder (tests count them).
    search: () => { log.push('find_folder'); return []; },
  };
  const followEngine = async () => {
    if (notesOn) return; notesOn = true;
    await settings();
    for (;;) {
      try {
        const r = await fakeHome('/engine/notes?since=' + notesFrom);
        for (const n of r.ok ? await r.json() : []) { notesFrom = n.n; const [event, payload] = NOTE[n.note]?.(n) ?? []; if (event) deliver({ event, payload, target: 'service' }); }
        await new Promise(ok => setTimeout(ok, 100));
      } catch { await new Promise(ok => setTimeout(ok, 2000)); }
    }
  };
  // A file on "disk": window.__disk, or a song received into the incoming folder (C:\\In\\<name>, or where it was saved).
  // A song received into the incoming folder: also on the test's disk, where the engine analyses, lists and moves it.
  const landed = f => { f.landing = fakeHome('/engine/incoming?name=' + encodeURIComponent(f.name), { method: 'POST', body: new Uint8Array(f.chunks.flat()) }).catch(() => {}); };
  // A song starts arriving in the incoming folder: under a name that isn't taken.
  const begin = name => { const taken = n => files.some(f => f.name === n); let n = name, i = 2; while (taken(n)) n = name.replace(/(\\.[^.]*)?$/, ' (' + i++ + ')$1'); files.push({ name: n, chunks: [], done: false }); return [files.length, n]; };
  // GLUE Home's own connections (ADR 0150), stood in for by the browser's (e2e/home-rtc.ts, built into .e2e-home).
  let rtcP = null;
  // What they say goes to the engine (the room, the sessions, songs received: ADR 0158), a song once it's on the disk;
  // a song arriving and what they were asked, to the service page.
  const rtcE = () => rtcP ??= import('/__e2e/home-rtc.js').then(m => m.rtc({
    emit: (name, payload) => {
      if (name === 'rtc-received') { const f = files.find(x => x.name === payload.name); void Promise.resolve(f?.landing).then(() => post({ rtc: name, payload })); }
      else if (['rtc-ice', 'rtc-state', 'rtc-activity'].includes(name)) void post({ rtc: name, payload });
      else send(name, payload, 'service');
    },
    cacheGet: k => cache[k] ? new Uint8Array(cache[k]) : null,
    // What another device puts (a mini spectrogram, an analysis): also where the engine reads it (ADR 0156).
    cachePut: (k, b) => { cache[k] = Array.from(b); void fakeHome('/engine/cache?rel=' + encodeURIComponent(k), { method: 'POST', body: new Uint8Array(b) }).catch(() => {}); },
    song: async p => disk(p) ?? await fakeHome('/engine/file?path=' + encodeURIComponent(p)).then(async r => r.ok ? [...new Uint8Array(await r.arrayBuffer())] : undefined).catch(() => undefined),
    answer: req => toEngine({ cmd: 'answer', req }),
    incomingBegin: name => begin(name),
    incomingWrite: (id, b) => files[id - 1].chunks.push(Array.from(b)),
    incomingEnd: (id, ok) => { const f = files[id - 1]; f.done = ok; if (ok) landed(f); return ok ? 'C:\\\\Users\\\\dj\\\\Music\\\\GLUE Incoming\\\\' + f.name : ''; },
  }));
  const disk = p => (window.__disk ?? {})[p] ?? files.find(f => f.done && !f.moved && (p === 'C:\\\\In\\\\' + f.name || p.endsWith('GLUE Incoming\\\\' + f.name)))?.chunks.flat();
  // Tauri's notification plugin puts its own Notification in the page (ADR 0074): here it records them.
  window.__notes = [];
  window.Notification = class { static permission = 'granted'; static requestPermission() { return Promise.resolve('granted'); } constructor(title, o) { window.__notes.push({ title, body: o?.body ?? '' }); } };
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label }, currentWebview: { windowLabel: label, label } },
    transformCallback(cb) { const id = next++; cbs.set(id, cb); return id; },
    unregisterCallback(id) { cbs.delete(id); },
    convertFileSrc: p => p,
    async invoke(cmd, args, opts) {
      log.push(cmd);
      switch (cmd) {
        case 'plugin:event|listen': listeners.push({ event: args.event, id: args.handler }); if (args.event === 'engine-changed') void followEngine(); return listeners.length;
        case 'plugin:event|unlisten': return;
        case 'plugin:event|emit': if (args.event === 'status') window.__status = args.payload; return send(args.event, args.payload);
        case 'plugin:event|emit_to': return send(args.event, args.payload, typeof args.target === 'string' ? args.target : args.target?.label);
        case 'get_config': return cfg();
        // The engine has them first (GLUE Home's reads the file itself), then the windows are told.
        case 'set_config': localStorage.setItem('home-config', JSON.stringify(args.config)); await settings(); send('config', args.config); return;
        case 'engine_cmd': return toEngine(args.cmd);
        case 'default_incoming': return 'C:\\\\Users\\\\dj\\\\Music\\\\GLUE Incoming';
        case 'default_duplicates': return 'C:\\\\Users\\\\dj\\\\GLUE duplicates';
        case 'device_name': return 'Studio PC';
        case 'incoming_begin': return begin(args.name);
        case 'incoming_write': files[Number(opts.headers['x-id']) - 1].chunks.push(Array.from(args)); return;
        case 'incoming_end': { const f = files[args.id - 1]; f.done = args.ok; if (args.ok) landed(f); return args.ok ? 'C:\\\\Users\\\\dj\\\\Music\\\\GLUE Incoming\\\\' + f.name : ''; }
        case 'set_status': case 'show_settings': return;
        case 'open_library': window.__opened = 'library'; return;
        case 'local_port': return window.__localPort ?? 47400;
        // The writer lease (ADR 0087): window.__lease says whether a GLUE tab holds it; edits_waiting counts.
        case 'lease_held': return !!window.__lease;
        case 'edits_waiting': window.__editsWaiting = (window.__editsWaiting ?? 0) + 1; return;
        // Updates: window.__update is the newer version, if any.
        case 'plugin:app|version': return '0.2.0';
        case 'plugin:updater|check': return window.__update ? { rid: 1, currentVersion: '0.2.0', version: window.__update, date: '', body: '', rawJson: {} } : null;
        case 'plugin:updater|download_and_install': window.__installed = window.__update; return;
        case 'plugin:process|restart': window.__restarted = true; return;
        // This computer's GLUE folder and music files (window.__glue: path → text, window.__disk: path → bytes).
        case 'find_glue_folder': return window.__glueFolder ?? null;
        // GLUE Home's own cache (in memory) and the incoming folder (the songs received, above).
        // GLUE Home's cache: what the page put (in memory), then what the engine wrote (the FakeHome's folder).
        case 'cache_read': {
          const b = cache[args.rel];
          if (b) return new Uint8Array(b).buffer;
          const r = await fakeHome('/engine/cache?rel=' + encodeURIComponent(args.rel)).catch(() => null);
          if (!r?.ok) throw 'not found';
          return await r.arrayBuffer();
        }
        case 'cache_write': cache[opts.headers['x-rel']] = Array.from(args); return;
        case 'activity_now': return { seconds: 120, counts: { 'bridge file_read': { calls: 3, ms: 12, bytes: 3145728 }, 'local /fs/list': { calls: 40, ms: 30, bytes: 0 } } };
        case 'cache_list': {
          const mem = Object.keys(cache).filter(k => k.startsWith(args.rel + '/') && !k.slice(args.rel.length + 1).includes('/')).map(k => k.slice(args.rel.length + 1));
          const r = await fakeHome('/engine/cache/list?rel=' + encodeURIComponent(args.rel)).catch(() => null);
          return [...new Set([...mem, ...(r?.ok ? await r.json() : [])])];
        }
        case 'incoming_list': return files.filter(f => f.done && !f.moved).map(f => ({ name: f.name, size: f.chunks.reduce((a, c) => a + c.length, 0), mtime: 1, path: 'C:\\\\In\\\\' + f.name }));
        case 'rtc_busy': return false;
        case 'verify_song': window.__verified = [...(window.__verified ?? []), args.id]; return (window.__verifyAnswer ?? {})[args.id] ?? { kind: 'same', ms: 1000, name: args.id };
        case 'glue_list': if (window.__glueDiskList) return window.__glueDiskList(args.rel); return Object.keys(window.__glue ?? {}).filter(k => k.startsWith(args.rel + '/') && !k.slice(args.rel.length + 1).includes('/')).map(k => k.slice(args.rel.length + 1));
        case 'plugin:notification|is_permission_granted': return true;
        // window.__glueDisk (a test's exposed function): the GLUE folder read from the real disk, as GLUE Home does.
        case 'glue_read': { const t = window.__glueDisk ? await window.__glueDisk(args.rel) ?? undefined : (window.__glue ?? {})[args.rel]; if (t === undefined) throw 'not found'; return t; }
        case 'file_size': { const b = disk(args.path); if (!b) throw 'not found'; return b.length; }
        case 'file_read': { const b = disk(args.path); if (!b) throw 'not found'; return new Uint8Array(b.slice(args.offset, args.offset + args.len)).buffer; }
        // ask() is a message dialog that answers with the clicked button's label.
        case 'plugin:dialog|message': { const b = args.buttons, labels = b && typeof b === 'object' ? Object.values(b)[0] : ['Yes', 'No']; return (window.__ask ?? true) ? labels[0] : labels[1]; }
        // window.__pick: the folder the dialog picks next (once).
        case 'plugin:dialog|open': { const f = window.__pick ?? 'D:\\\\Incoming'; window.__pick = undefined; return f; }
        case 'plugin:autostart|is_enabled': return localStorage.getItem('autostart') === '1';
        case 'plugin:autostart|enable': localStorage.setItem('autostart', '1'); return;
        case 'plugin:autostart|disable': localStorage.setItem('autostart', '0'); return;
        case 'plugin:deep-link|get_current': return window.__deepLink ?? null;
        case 'plugin:opener|open_url': window.__opened = args.url; return;
        default: return null;
      }
    },
  };
})();`;
