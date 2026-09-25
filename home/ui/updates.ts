/* GLUE Home updates itself (ADR 0045): the updater plugin reads latest.json from the latest GitHub
   release, checks the signature against the key in tauri.conf.json, installs, and restarts. */
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { getVersion } from '@tauri-apps/api/app';

export const version = () => getVersion();
export async function findUpdate(): Promise<Update | null> { return (await check()) ?? null; }

/** Download, install and restart (Windows: a small installer window; macOS: the app is replaced). */
export async function install(u: Update, progress?: (got: number, total: number) => void) {
  let got = 0, total = 0;
  await u.downloadAndInstall(e => {
    if (e.event === 'Started') total = e.data.contentLength ?? 0;
    else if (e.event === 'Progress') { got += e.data.chunkLength; progress?.(got, total); }
  });
  await relaunch();
}
