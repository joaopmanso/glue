/* Shared by the tests that open a big synthetic collection (perf.spec, narrow.spec). */
import type { Page } from '@playwright/test';

/** A GLUE folder (path → text), served to the page and written into its private storage as "MCO". */
export async function seedFolder(page: Page, bundle: string) {
  await page.route('**/__synth/bundle', r => r.fulfill({ status: 200, contentType: 'application/json', body: bundle }));
  await page.goto('./?perf#/analyze');
  await page.evaluate(async () => {
    const root = await navigator.storage.getDirectory();
    for (const name of ['MCO', 'Music', 'cache']) await root.removeEntry(name, { recursive: true }).catch(() => {});
    await new Promise(r => { const q = indexedDB.deleteDatabase('mco'); q.onsuccess = q.onerror = r; });
    const files = await (await fetch('./__synth/bundle')).json() as [string, string][];
    const home = await root.getDirectoryHandle('MCO', { create: true });
    const dirs = new Map<string, FileSystemDirectoryHandle>();
    const dirOf = async (parts: string[]) => {
      let d = home, key = '';
      for (const p of parts) { key += '/' + p; let h = dirs.get(key); if (!h) dirs.set(key, h = await d.getDirectoryHandle(p, { create: true })); d = h; }
      return d;
    };
    for (const [path, text] of files) {
      const parts = path.split('/'), name = parts.pop()!;
      const w = await (await (await dirOf(parts)).getFileHandle(name, { create: true })).createWritable();
      await w.write(text); await w.close();
    }
  });
}
