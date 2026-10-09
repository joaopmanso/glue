/* GLUE's streaming service worker (ADR 0076, 0174). A song on another computer plays from an address under
   `__stream/<token>`: the <audio> element asks for byte ranges there, and this worker asks the page that
   made the token for those bytes (it fetches them from that computer's GLUE Home over WebRTC). Every
   other request goes to the network untouched: this worker caches nothing.
   The bytes stream as they arrive (ADR 0174), as an HTTP server sends a file: the answer to the player's range starts
   with the first bytes GLUE Home sends, and the page fetches the next piece when the player has room for it (it waited
   for each 8 MB piece whole before, and a phone's player then waited 20 s and more for a WAV, 2026-10-09). A page from
   before answers a range in one message (`bytes`): that still works. */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
// A page opened with a hard reload isn't controlled: it asks to be.
self.addEventListener('message', e => { if (e.data && e.data.glueClaim) e.waitUntil(self.clients.claim()); });

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url), at = url.pathname.indexOf('/__stream/');
  if (at < 0 || url.origin !== self.location.origin) return;
  e.respondWith(serve(e.request, decodeURIComponent(url.pathname.slice(at + 10))));
});

/** How much the player's stream holds before the page fetches more: a few seconds of a hi-res WAV. */
const AHEAD = 4 * 1024 * 1024;

async function serve(req, token) {
  const m = /bytes=(\d+)-(\d*)/.exec(req.headers.get('range') || '');
  const start = m ? Number(m[1]) : 0, end = m && m[2] ? Number(m[2]) : null;
  const got = await ask({ token, start, end, stream: true });
  const answer = got && got.data;
  if (!answer || answer.error) return new Response(answer && answer.error || 'That stream is gone.', { status: answer && answer.error ? 502 : 404 });
  if (start >= answer.total) return new Response(null, { status: 416, headers: { 'Content-Range': 'bytes */' + answer.total } });
  const headers = (len) => ({
    'Content-Type': answer.type || 'application/octet-stream', 'Content-Length': String(len),
    'Content-Range': 'bytes ' + start + '-' + (start + len - 1) + '/' + answer.total, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store',
  });
  // A page from before: the whole piece in one message.
  if (answer.bytes) { const bytes = new Uint8Array(answer.bytes); return new Response(bytes, { status: 206, headers: headers(bytes.byteLength) }); }
  return new Response(body(got.port, answer.first), { status: 206, headers: headers(answer.len) });
}

/** The range's bytes as they come: the page sends chunks, says when a piece is done (`piece`: this worker asks for
    the next one when the player has room) and when the range is (`done`); `fail` mid-way ends it with an error. */
function body(port, first) {
  let waiting = null, asked = false, finished = false;
  const wake = () => { const w = waiting; waiting = null; if (w) w(); };
  return new ReadableStream({
    start(c) {
      if (first) c.enqueue(new Uint8Array(first));
      port.onmessage = ev => {
        const d = ev.data || {};
        if (d.chunk) c.enqueue(new Uint8Array(d.chunk));
        // A piece done: the next one at once if the player has room (the stream may not ask again by itself).
        else if (d.piece) { asked = false; if (c.desiredSize > 0) { asked = true; port.postMessage({ more: true }); } }
        else if (d.done) { finished = true; c.close(); }
        else if (d.fail) { finished = true; c.error(new Error(d.fail)); }
        wake();
      };
    },
    pull() {
      if (finished) return;
      if (!asked) { asked = true; port.postMessage({ more: true }); }
      return new Promise(res => { waiting = res; });
    },
    cancel() { finished = true; port.postMessage({ cancel: true }); wake(); },
  }, { highWaterMark: AHEAD, size: ch => ch.byteLength });
}

/** Ask the open GLUE pages; the one that made the token answers (the others say they don't know it): its first
    message, and the port it goes on answering on. */
async function ask(req) {
  const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  if (!pages.length) return null;
  return new Promise(resolve => {
    let left = pages.length;
    const none = () => { if (--left === 0) resolve(null); };
    for (const p of pages) {
      const ch = new MessageChannel();
      ch.port1.onmessage = ev => { if (ev.data && ev.data.unknown) none(); else resolve({ data: ev.data, port: ch.port1 }); };
      p.postMessage({ glueStream: req }, [ch.port2]);
    }
    setTimeout(() => resolve({ data: { error: 'GLUE Home didn’t answer in time.' } }), 45000);
  });
}
