/* GLUE Home's settings window talking to its Rust side and to the OS (ADR 0044): the settings, its status (the
   engine's service, ADR 0160), start at login, the folder picker, links. */
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { AnalysisState, EngineStatus } from './engine';

export const API = 'https://glue-api.joaopmanso.workers.dev';
export const WEBSITE = 'https://joaopmanso.github.io/glue/';

/** What GLUE Home keeps (config.json in the app's settings folder, readable by this user only). */
/** Songs GLUE Home analyses at a time when not set: this computer's cores less 4 (some left for
    everything else), 2 to 12. */
export const autoPool = () => { const n = navigator.hardwareConcurrency || 4; return Math.max(Math.min(2, n), Math.min(12, n - 4)); };

export interface HomeConfig {
  api?: string;
  /** GLUE Home's first-run guide was finished or put away (ADR 0159). */
  setupDone?: boolean;
  /** The read-only token for a GLUE tab on this computer (ADR 0104): it reads, and asks the engine to change things. */
  readToken?: string;
  /** The DJ libraries GLUE Home follows (written by its Rust side, ADR 0065). */
  libraries?: unknown[];
  /** The analysis of this computer's songs is paused (ADR 0103): from the settings or a GLUE tab. */
  analysisPaused?: boolean;
  /** Where "Open GLUE library" opens it (ADR 0151): GLUE Home's own window (unset), or the browser. */
  libraryIn?: 'window' | 'browser';
  /** Songs analysed at a time (0 or none: automatic, cache.autoPool). */
  analysisWorkers?: number;
  deviceId: string | null;
  token: string | null;         // the device credential
  name: string;
  user: { email: string | null; name: string | null } | null;
  incoming: string | null;
  running: boolean;             // the service should be on (Stop in the tray turns it off)
  askedAutostart: boolean;      // the "start with this computer?" question was answered
  received?: Received[];        // the last songs received
  glue?: string | null;         // this computer's GLUE folder (the website's), read-only (ADR 0045)
  folders?: Record<string, string>;   // music folder id → where it is on this computer
  autoUpdate?: boolean;         // install updates by itself (on unless turned off)
  serve?: Record<string, boolean>;    // 'profile/collection' → shared with other computers (on unless false)
  localToken?: string;          // what the website on this computer shows the local link (ADR 0048)
  duplicates?: string | null;   // where duplicates the website puts aside go (ADR 0070)
  reminders?: boolean;          // notify of events that need music (ADR 0074; on unless false)
  maxSessions?: number;         // devices connected at once (ADR 0133; 5 unless set)
  networkAtOnce?: number;       // songs analysed at once from each network folder (ADR 0136; 0 or unset: no limit)
  /** The computer GLUE Home is on (ADR 0108): the account device its shared parts go under; learned from GLUE
      Cloud (its companion) or its music folders. None yet: nothing per computer is written. */
  computer?: string | null;
  /** Why it isn't known (for the Activity page). */
  computerWhy?: string;
}
export interface Received { name: string; path: string; from: string; at: number; size: number }

/** GLUE Home's status (crates/glue-engine/src/service.rs `status_json`): its window and tray show it. */
export interface Status { state: 'unpaired' | 'stopped' | 'connecting' | 'online' | 'offline' | 'removed'; text: string; running: boolean; receiving: { name: string; got: number; size: number } | null; received: Received[];
  /** Finding the music folders of the shared collections (by itself). */
  library?: { searching: boolean; found: number; missing: { id: string; name: string; collection: string }[] };
  /** Making mini spectrograms and analyses of the shared songs (ADR 0046). */
  analysis?: { done: number; total: number; running: boolean };
  /** Analysing this computer's songs for the library (ADR 0103). */
  analysing?: AnalysisState;
  /** Which computer this is (ADR 0108), and how GLUE Home knows (or why it doesn't). */
  computer?: { id: string | null; why: string };
  /** The library engine (ADR 0104): its revision, and the jobs under way. */
  engine?: EngineStatus;
  /** The native engine checked against this computer's analyses (ADR 0147). */
  verify?: VerifyState;
  /** What GLUE Home did lately, newest first (the settings window shows each new one as a toast). */
  events?: { at: number; text: string }[];
  /** The last look at the events (ADR 0074): when, how many need music, which were just notified. */
  reminders?: { at: number; coming: number; sent: string[] };
  /** What other devices asked since GLUE Home started, by kind (ADR 0083). */
  served?: Record<string, Activity>;
  /** The devices connected now (ADR 0133): one session per browser tab, at most `max`. */
  sessions?: { list: { key: string; name: string; since: number; last: number; calls: number; open: boolean }[]; max: number } }
/** How many, the time spent (ms), the bytes. */
export interface Activity { calls: number; ms: number; bytes: number }
/** The native engine checked against this computer's analyses (ADR 0147; crates/glue-engine/src/verify.rs). */
export interface VerifyState {
  running: boolean; done: number; total: number;
  counts: Partial<Record<'same' | 'close' | 'differs' | 'failed' | 'fixed' | 'skipped' | 'missing', number>>;
  /** The native analyses' time (ms), and the songs it's over. */
  ms: number; timed: number;
  /** Why songs were skipped, and how many each. */
  skips: Record<string, number>;
  /** The latest that differ or failed, newest first. */
  odd: { name: string; kind: string; why: string }[];
}
/** What GLUE Home's engine is asked (`glue_engine::command`). */
const cmd = <T>(c: Record<string, unknown>) => invoke<T>('engine_cmd', { cmd: c });

export const bridge = {
  config: () => invoke<HomeConfig | null>('get_config'),
  saveConfig: (config: HomeConfig) => invoke<void>('set_config', { config }),
  /** Change some settings over what's saved now, never over a copy held in memory (another window, or the
      local link's folder dialog, may have saved since): `f` sees the current settings and returns only
      what changes (null: nothing). The settings saved. */
  patchConfig: async (f: (cur: HomeConfig) => Partial<HomeConfig> | null): Promise<HomeConfig | null> => {
    const cur = await invoke<HomeConfig | null>('get_config');
    if (!cur) return null;
    const p = f(cur);
    if (!p) return cur;
    const next = { ...cur, ...p } as HomeConfig;
    await invoke<void>('set_config', { config: next });
    return next;
  },
  defaultIncoming: () => invoke<string>('default_incoming'),
  defaultDuplicates: () => invoke<string>('default_duplicates'),
  deviceName: () => invoke<string>('device_name'),
  showSettings: () => invoke<void>('show_settings'),
  openLibrary: () => invoke<void>('open_library'),
  // This computer's GLUE library (read-only) and its music files.
  findGlue: () => invoke<string | null>('find_glue_folder'),
  /** A new GLUE folder (Documents\GLUE, ADR 0159): its path. */
  newGlueFolder: () => invoke<string>('new_glue_folder'),
  /** A folder chosen as the GLUE folder: GLUE's (it has mco.json), or empty (set up when the library opens it). */
  folderState: (path: string) => invoke<{ glue: boolean; empty: boolean }>('folder_state', { path }),
  /** What GLUE Home's own side was asked since it started: the local link, file reads (ADR 0083). */
  activity: () => invoke<{ seconds: number; counts: Record<string, Activity> }>('activity_now'),
  onConfig: (f: (c: HomeConfig) => void) => listen<HomeConfig>('config', e => f(e.payload)),
  // GLUE Home's service, in its engine (ADR 0160): its status when it changes, and now; Start / Stop / Restart.
  onStatus: (f: (s: Status) => void) => listen<Status>('status', e => f(e.payload)),
  askStatus: () => cmd<Status>({ cmd: 'serviceStatus' }),
  control: (what: 'start' | 'stop' | 'restart') => cmd({ cmd: 'control', what }),
  /** The settings' "Check now" for reminders. */
  remindNow: () => cmd({ cmd: 'remindNow' }),
  /** End a device's session (ADR 0133); it's refused for an hour. */
  disconnect: (key: string) => cmd({ cmd: 'roomDisconnect', key }),
  /** The settings' check of the native engine (ADR 0147): `n` songs, 0 to stop. */
  verify: (n: number) => cmd({ cmd: 'verify', n }),
};

/** The OS: plugins loaded on demand. */
export async function pickFolder(start?: string | null): Promise<string | null> {
  const { open } = await import('@tauri-apps/plugin-dialog');
  const r = await open({ directory: true, multiple: false, defaultPath: start ?? undefined, title: 'Where should songs sent to this computer go?' });
  return typeof r === 'string' ? r : null;
}
export async function askYesNo(message: string, title: string, yes: string, no: string): Promise<boolean> {
  const { ask } = await import('@tauri-apps/plugin-dialog');
  return ask(message, { title, kind: 'info', okLabel: yes, cancelLabel: no });
}
export async function autostart() { return import('@tauri-apps/plugin-autostart'); }
export async function openUrl(url: string) { const { openUrl } = await import('@tauri-apps/plugin-opener'); await openUrl(url); }
export async function openFolder(path: string) { const { openPath } = await import('@tauri-apps/plugin-opener'); await openPath(path); }
/** gluehome://pair?code=… links, at launch and while running. */
export async function onPairLink(f: (code: string) => void) {
  const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
  const take = (urls: string[] | null) => { for (const u of urls ?? []) { const m = /[?&]code=([\w-]+)/.exec(u); if (m) f(decodeURIComponent(m[1])); } };
  take(await getCurrent().catch(() => null));
  await onOpenUrl(take);
}
