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
  const cfg = () => JSON.parse(localStorage.getItem('home-config') || 'null');
  // A file on "disk": window.__disk, or a song received into the incoming folder (C:\\In\\<name>, or where it was saved).
  const disk = p => (window.__disk ?? {})[p] ?? files.find(f => f.done && !f.moved && (p === 'C:\\\\In\\\\' + f.name || p.endsWith('GLUE Incoming\\\\' + f.name)))?.chunks.flat();
  window.__TAURI_INTERNALS__ = {
    metadata: { currentWindow: { label }, currentWebview: { windowLabel: label, label } },
    transformCallback(cb) { const id = next++; cbs.set(id, cb); return id; },
    unregisterCallback(id) { cbs.delete(id); },
    convertFileSrc: p => p,
    async invoke(cmd, args, opts) {
      log.push(cmd);
      switch (cmd) {
        case 'plugin:event|listen': listeners.push({ event: args.event, id: args.handler }); return listeners.length;
        case 'plugin:event|unlisten': return;
        case 'plugin:event|emit': return send(args.event, args.payload);
        case 'plugin:event|emit_to': return send(args.event, args.payload, typeof args.target === 'string' ? args.target : args.target?.label);
        case 'get_config': return cfg();
        case 'set_config': localStorage.setItem('home-config', JSON.stringify(args.config)); send('config', args.config); return;
        case 'default_incoming': return 'C:\\\\Users\\\\dj\\\\Music\\\\GLUE Incoming';
        case 'device_name': return 'Studio PC';
        case 'incoming_begin': { const taken = n => files.some(f => f.name === n); let n = args.name, i = 2; while (taken(n)) n = args.name.replace(/(\\.[^.]*)?$/, ' (' + i++ + ')$1'); files.push({ name: n, chunks: [], done: false }); return [files.length, n]; }
        case 'incoming_write': files[Number(opts.headers['x-id']) - 1].chunks.push(Array.from(args)); return;
        case 'incoming_end': { const f = files[args.id - 1]; f.done = args.ok; return args.ok ? 'C:\\\\Users\\\\dj\\\\Music\\\\GLUE Incoming\\\\' + f.name : ''; }
        case 'set_status': case 'show_settings': return;
        case 'open_library': window.__opened = 'library'; return;
        case 'local_port': return 47400;
        // Updates: window.__update is the newer version, if any.
        case 'plugin:app|version': return '0.2.0';
        case 'plugin:updater|check': return window.__update ? { rid: 1, currentVersion: '0.2.0', version: window.__update, date: '', body: '', rawJson: {} } : null;
        case 'plugin:updater|download_and_install': window.__installed = window.__update; return;
        case 'plugin:process|restart': window.__restarted = true; return;
        // This computer's GLUE folder and music files (window.__glue: path → text, window.__disk: path → bytes).
        case 'find_glue_folder': return window.__glueFolder ?? null;
        case 'known_folders': return { home: 'C:\\\\Users\\\\dj', music: 'C:\\\\Users\\\\dj\\\\Music', documents: 'C:\\\\Users\\\\dj\\\\Documents', desktop: null, downloads: null, sep: '\\\\' };
        case 'path_exists': return Object.keys(window.__disk ?? {}).some(p => p === args.path || p.startsWith(args.path + '\\\\'));
        // GLUE Home's own cache (in memory) and the incoming folder (the songs received, above).
        case 'cache_read': { const b = cache[args.rel]; if (!b) throw 'not found'; return new Uint8Array(b).buffer; }
        case 'cache_write': cache[opts.headers['x-rel']] = Array.from(args); return;
        case 'cache_list': return Object.keys(cache).filter(k => k.startsWith(args.rel + '/') && !k.slice(args.rel.length + 1).includes('/')).map(k => k.slice(args.rel.length + 1));
        case 'incoming_list': return files.filter(f => f.done && !f.moved).map(f => ({ name: f.name, size: f.chunks.reduce((a, c) => a + c.length, 0), mtime: 1, path: 'C:\\\\In\\\\' + f.name }));
        case 'incoming_move': { const f = files.find(x => x.name === args.name && x.done && !x.moved); if (!f) throw 'not found'; f.moved = args.to; return args.to + '\\\\' + f.name; }
        // window.__find: folder name → where the drive search finds it.
        case 'find_folder': return (window.__find ?? {})[args.name] ?? null;
        case 'glue_read': { const t = (window.__glue ?? {})[args.rel]; if (t === undefined) throw 'not found'; return t; }
        case 'file_size': { const b = disk(args.path); if (!b) throw 'not found'; return b.length; }
        case 'file_read': { const b = disk(args.path); if (!b) throw 'not found'; return new Uint8Array(b.slice(args.offset, args.offset + args.len)).buffer; }
        // ask() is a message dialog that answers with the clicked button's label.
        case 'plugin:dialog|message': { const b = args.buttons, labels = b && typeof b === 'object' ? Object.values(b)[0] : ['Yes', 'No']; return (window.__ask ?? true) ? labels[0] : labels[1]; }
        case 'plugin:dialog|open': return 'D:\\\\Incoming';
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
