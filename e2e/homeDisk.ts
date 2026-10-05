/* A test's GLUE Home computer on disk (ADR 0154): its GLUE folder written from the test's files, its songs as real
   files in its Music folder, and e2e/fakeHome.ts running the real library engine over them (the engine reads the
   GLUE folder and the songs itself, so they can't be stood in for in the page). */
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { BrowserContext, Page } from '@playwright/test';
import { FakeHome } from './fakeHome';

export interface HomeDisk {
  fake: FakeHome; tmp: string; glue: string; music: string;
  /** GLUE Home's service or settings page (or every page of a context), before it opens: the stand-in reaches this
      engine, and reads the GLUE folder from disk (as GLUE Home does), not from the page's copy. */
  wire(page: Page | BrowserContext): Promise<void>;
  done(): Promise<void>;
}

/** `glue`: the GLUE folder's files (path → text); `songs`: files in the Music folder (path in it → bytes). */
export async function homeDisk(glue: Record<string, string>, songs: Record<string, Buffer> = {}, opts: { known?: { home?: string }; folders?: Record<string, string> } = {}): Promise<HomeDisk> {
  const tmp = mkdtempSync(join(tmpdir(), 'glue-home-disk-'));
  const g = join(tmp, 'GLUE'), music = join(tmp, 'Music');
  for (const [rel, text] of Object.entries(glue)) { mkdirSync(dirname(join(g, rel)), { recursive: true }); writeFileSync(join(g, rel), text); }
  for (const [rel, b] of Object.entries(songs)) { mkdirSync(dirname(join(music, rel)), { recursive: true }); writeFileSync(join(music, rel), b); }
  mkdirSync(join(tmp, 'Incoming'), { recursive: true }); mkdirSync(music, { recursive: true });
  const fake = new FakeHome({ glue: g, incoming: join(tmp, 'Incoming'), folders: opts.folders ?? {} }, { known: { music, ...opts.known } });
  await fake.start();
  return {
    fake, tmp, glue: g, music,
    async wire(page) {
      await page.exposeFunction('__glueDisk', (rel: string) => { try { return readFileSync(join(g, rel), 'utf8'); } catch { return null; } });
      await page.exposeFunction('__glueDiskList', (rel: string) => { try { const d = join(g, rel); return readdirSync(d).filter(n => statSync(join(d, n)).isFile()); } catch { return []; } });
      await page.addInitScript(({ port, token }) => { Object.assign(window, { __localPort: port, __homeToken: token }); }, { port: fake.port, token: fake.token });
    },
    async done() { await fake.stop(); rmSync(tmp, { recursive: true, force: true }); },
  };
}
