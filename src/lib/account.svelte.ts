/* GLUE Cloud account (ADR 0036), optional: Google sign-in, this browser as a device, the device list,
   pairing codes for GLUE Home, and live presence over the signaling room. Nothing here touches the
   local library; signing out changes nothing on this computer. */
import { readPref, writePref } from './prefs';

export const API_BASE = readPref('apiBase', 'https://glue-api.joaopmanso.workers.dev');
export const GOOGLE_CLIENT_ID = '486502590189-93o8r488c7gst4bviqvbsuflke7ujd06.apps.googleusercontent.com';
const GIS_URL = 'https://accounts.google.com/gsi/client';

export interface CloudUser { id: string; email: string | null; name: string | null; picture: string | null }
export interface CloudDevice { id: string; kind: 'browser' | 'home'; name: string; platform: string | null; createdAt: number; lastSeen: number | null }
interface Session { access: string; refresh: string; deviceId: string }

type GoogleId = { accounts: { id: { initialize(o: Record<string, unknown>): void; renderButton(el: HTMLElement, o: Record<string, unknown>): void; disableAutoSelect(): void } } };

/** "Edge on Windows", from the user agent: how this browser is named in the device list. */
export function browserName(ua = navigator.userAgent): string {
  const b = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS X/.test(ua) ? 'Mac' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return os ? b + ' on ' + os : b;
}

class Account {
  user = $state<CloudUser | null>(null);
  devices = $state<CloudDevice[]>([]);
  thisDevice = $state<string | null>(null);
  online = $state.raw<Set<string>>(new Set());
  phase = $state<'signed-out' | 'working' | 'signed-in'>('signed-out');
  error = $state('');
  /** The live connection to the signaling room. */
  connected = $state(false);
  /** GLUE Cloud answered: the Sign in button shows only then (and while signed in). */
  available = $state(false);
  private access = ''; private accessExp = 0;
  private ws: WebSocket | null = null; private retry = 0; private pingTimer = 0; private closing = false;
  private gis: Promise<GoogleId> | null = null;

  get signedIn() { return this.phase === 'signed-in' && !!this.user; }
  private get refreshToken() { return readPref('cloud.refresh', ''); }
  private set refreshToken(v: string) { writePref('cloud.refresh', v); }

  /** On start: resume a session kept from before (quietly; offline or signed out is fine). */
  async init() {
    void this.probe();
    if (!this.refreshToken) return;
    this.phase = 'working';
    try { await this.renew(); await this.loadMe(); this.connect(); }
    catch (e) { if ((e as { status?: number }).status === 401) this.forget(); else { this.phase = 'signed-out'; this.error = 'GLUE Cloud is unreachable right now.'; } }
  }

  private async probe() {
    try {
      const r = await fetch(API_BASE + '/v1/health', { signal: AbortSignal.timeout(5000) });
      this.available = r.ok;
    } catch { this.available = false; }
  }

  /** Google's sign-in button, drawn into `el`. */
  async renderGoogle(el: HTMLElement, dark: boolean) {
    const g = await this.loadGis();
    g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: { credential: string }) => void this.withGoogle(r.credential), ux_mode: 'popup', auto_select: false, itp_support: true });
    g.accounts.id.renderButton(el, { type: 'standard', theme: dark ? 'filled_black' : 'outline', size: 'large', text: 'signin_with', shape: 'pill', logo_alignment: 'left', width: 260 });
  }
  private loadGis(): Promise<GoogleId> {
    const w = window as unknown as { google?: GoogleId };
    if (w.google?.accounts?.id) return Promise.resolve(w.google);
    return this.gis ??= new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_URL; s.async = true;
      s.onload = () => w.google ? resolve(w.google) : reject(new Error('Google sign-in didn’t load'));
      s.onerror = () => { this.gis = null; reject(new Error('Couldn’t reach Google sign-in')); };
      document.head.appendChild(s);
    });
  }

  async withGoogle(credential: string) {
    this.phase = 'working'; this.error = '';
    try {
      const s = await this.post<Session & { user: CloudUser }>('/v1/auth/google', { credential, deviceId: readPref('cloud.device', '') || undefined, deviceName: browserName(), platform: navigator.platform || '' });
      this.keep(s);
      this.user = s.user;
      await this.loadMe();
      this.connect();
    } catch (e) { this.phase = 'signed-out'; this.error = (e as Error).message; }
  }

  async signOut() {
    const r = this.refreshToken;
    this.forget();
    try { (window as unknown as { google?: GoogleId }).google?.accounts.id.disableAutoSelect(); } catch { /* not loaded */ }
    if (r) await fetch(API_BASE + '/v1/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh: r }) }).catch(() => {});
  }
  async deleteAccount() {
    await this.call('DELETE', '/v1/me');
    this.forget();
  }

  /** A single-use code (10 minutes) that GLUE Home enters to join this account. */
  pair() { return this.call<{ code: string; expiresAt: number }>('POST', '/v1/pairing', {}); }
  async rename(id: string, name: string) { await this.call('PATCH', '/v1/devices/' + id, { name }); await this.loadMe(); }
  async remove(id: string) { await this.call('DELETE', '/v1/devices/' + id); await this.loadMe(); }
  /** Told once per sign-in (sync starts then). */
  onSignedIn: (() => void) | null = null;
  async loadMe() {
    const r = await this.call<{ user: CloudUser; thisDevice: string; devices: CloudDevice[] }>('GET', '/v1/me');
    const first = this.phase !== 'signed-in';
    this.user = r.user; this.devices = r.devices; this.thisDevice = r.thisDevice; this.phase = 'signed-in';
    if (first) this.onSignedIn?.();
  }

  /** Signed-in request to GLUE Cloud (sync uses it). `text` sends a plain-text body; `raw` returns the body as text. */
  async request<T = unknown>(method: string, path: string, opts: { json?: unknown; text?: string; raw?: boolean } = {}): Promise<T> {
    if (!this.access || Date.now() > this.accessExp) await this.renew();
    const go = () => fetch(API_BASE + path, { method, headers: { Authorization: 'Bearer ' + this.access, ...(opts.json !== undefined ? { 'Content-Type': 'application/json' } : opts.text !== undefined ? { 'Content-Type': 'text/plain' } : {}) }, body: opts.json !== undefined ? JSON.stringify(opts.json) : opts.text });
    let r = await go();
    if (r.status === 401) { try { await this.renew(); } catch (e) { this.forget(); throw e; } r = await go(); }
    if (!r.ok) { const j = await r.json().catch(() => ({})) as { error?: string }; throw Object.assign(new Error(j.error || 'GLUE Cloud said no (' + r.status + ')'), { status: r.status }); }
    return (opts.raw ? await r.text() : await r.json()) as T;
  }

  // ---- plumbing -----------------------------------------------------------------------------------
  private keep(s: Session) {
    this.access = s.access; this.accessExp = Date.now() + 55 * 60e3;
    this.refreshToken = s.refresh; writePref('cloud.device', s.deviceId); this.thisDevice = s.deviceId;
  }
  private forget() {
    this.closing = true; this.ws?.close(); this.ws = null; clearInterval(this.pingTimer);
    this.access = ''; this.accessExp = 0; this.refreshToken = '';
    this.user = null; this.devices = []; this.online = new Set(); this.connected = false; this.phase = 'signed-out';
  }
  private async renew() {
    const s = await this.post<Session>('/v1/auth/refresh', { refresh: this.refreshToken });
    this.keep(s);
  }
  private async post<T>(path: string, body: unknown): Promise<T> {
    const r = await fetch(API_BASE + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) throw Object.assign(new Error(j.error || 'GLUE Cloud said no (' + r.status + ')'), { status: r.status });
    return j;
  }
  private async call<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
    if (!this.access || Date.now() > this.accessExp) await this.renew();
    const go = () => fetch(API_BASE + path, { method, headers: { Authorization: 'Bearer ' + this.access, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    let r = await go();
    if (r.status === 401) {
      try { await this.renew(); } catch (e) { this.forget(); throw e; }
      r = await go();
    }
    const j = await r.json().catch(() => ({})) as T & { error?: string };
    if (!r.ok) { if (r.status === 401) this.forget(); throw Object.assign(new Error(j.error || 'GLUE Cloud said no (' + r.status + ')'), { status: r.status }); }
    return j;
  }

  /** The signaling room: presence now, WebRTC offers / answers later (ADR 0037). Reconnects with backoff. */
  private connect() {
    if (this.ws) return;
    this.closing = false;
    void (async () => {
      try { if (!this.access || Date.now() > this.accessExp) await this.renew(); } catch { return this.later(); }
      const ws = new WebSocket(API_BASE.replace(/^http/, 'ws') + '/v1/signal?token=' + encodeURIComponent(this.access));
      this.ws = ws;
      ws.onopen = () => { this.retry = 0; this.connected = true; clearInterval(this.pingTimer); this.pingTimer = window.setInterval(() => ws.readyState === 1 && ws.send('{"type":"ping"}'), 30_000); };
      ws.onmessage = e => {
        let m: { type: string; online?: string[] };
        try { m = JSON.parse(String(e.data)); } catch { return; }
        if (m.type === 'removed') { this.forget(); this.error = 'This browser was removed from your GLUE account.'; return; }
        // Another tab of this browser took over. Act now: the close handshake may never complete.
        if (m.type === 'replaced') { this.closing = true; ws.onclose = null; ws.close(); this.ws = null; this.connected = false; clearInterval(this.pingTimer); return; }
        if (m.type === 'presence' && m.online) {
          const before = this.online;
          this.online = new Set(m.online);
          // A device we don't know yet (a GLUE Home that just paired): refresh the list.
          if (m.online.some(id => !before.has(id) && !this.devices.some(d => d.id === id))) void this.loadMe().catch(() => {});
        }
      };
      ws.onclose = e => {
        this.ws = null; this.connected = false; clearInterval(this.pingTimer); this.online = new Set();
        if (e.code === 4001) { this.forget(); this.error = 'This browser was removed from your GLUE account.'; return; }
        if (!this.closing && e.code !== 4000) this.later();
      };
    })();
  }
  private later() {
    if (this.closing || !this.refreshToken) return;
    const wait = Math.min(60_000, 1000 * 2 ** this.retry++);
    setTimeout(() => { if (!this.ws && this.phase === 'signed-in') this.connect(); }, wait);
  }
}

export const account = new Account();
