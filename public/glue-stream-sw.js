/* GLUE's streaming service worker (ADR 0076). A song on another computer plays from an address under
   `__stream/<token>`: the <audio> element asks for byte ranges there, and this worker asks the page that
   made the token for those bytes (it fetches them from that computer's GLUE Home over WebRTC). Every
   other request goes to the network untouched: this worker caches nothing. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url), at = url.pathname.indexOf('/__stream/');
  if (at < 0 || url.origin !== self.location.origin) return;
  e.respondWith(serve(e.request, decodeURIComponent(url.pathname.slice(at + 10))));
});

async function serve(req, token) {
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') || '');
  const start = m ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : null;
  const answer = await ask({ token, start, end });
  if (!answer || answer.error) return new Response(answer && answer.error || 'That stream is gone.', { status: answer && answer.error ? 502 : 404 });
  const bytes = new Uint8Array(answer.bytes), last = start + bytes.byteLength - 1;
  if (start >= answer.total) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + answer.total } });
  return new Response(bytes, { status: 206, headers: {
    'Content-Type': answer.type || 'application/octet-stream', 'Content-Length': String(bytes.byteLength),
    'Content-Range': 'bytes ' + start + '-' + last + '/' + answer.total, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
  } });
}

/** Ask the open GLUE pages; the one that made the token answers (the others say they don't know it). */
async function ask(req) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!pages.length) return null;
  return new Promise(resolve => {
    let left = pages.length;
    const none = () => { if (--left === 0) resolve(null); };
    for (const p of pages) {
      const ch = new MessageChannel();
      ch.port1.onmessage = ev => { if (ev.data && ev.data.unknown) none(); else resolve(ev.data); };
      p.postMessage({ glueStream: req }, [ch.port2]);
    }
    setTimeout(() => resolve({ error: 'GLUE Home didn’t answer in time.' }), 45000);
  });
}
