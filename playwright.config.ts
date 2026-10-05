import { defineConfig } from '@playwright/test';
import { EDGE_ARGS } from './e2e/launch';

// By default runs against the production build under /glue/, the way GitHub Pages serves it.
// BASE_URL=https://joaopmanso.github.io/glue/ runs the same tests against the live site.
// Uses the installed Microsoft Edge (channel 'msedge'), so no browser download is needed.
// Always a fresh build: a server left on the port fails the run instead of serving old code (a stale
// dev server once did, 2026-09-27).
const live = process.env.BASE_URL;
// The tests with several browsers or a stand-in GLUE Home: heavy, and the ones that failed only when run
// next to everything else. They get their own project, two at a time; every other test runs in parallel.
// Also tagged @heavy: the ones inside other files (GLUE Home, GLUE Cloud, the local link).
const HEAVY = /(computers|shared|phone|homemode|home|identity)\.spec\.ts|@heavy/;
export default defineConfig({
  testDir: 'e2e',
  // GLUE Home's library engine, built for the tests that run it (e2e/fakeHome.ts, ADR 0153).
  globalSetup: './e2e/engine-build.ts',
  timeout: 120_000,
  fullyParallel: true,
  // On CI's smaller machine a heavy test sometimes misses a timeout under load: tried once more (reported
  // as flaky, not hidden). Locally a failure stays a failure.
  retries: process.env.CI ? 1 : 0,
  // One test already keeps this 12-thread laptop busy (a renderer, software drawing): two at once each
  // took twice as long (measured 2026-09-29). Test pages see two cores and no GPU (e2e/launch.ts), and
  // four tests at once is about what it takes.
  workers: process.env.CI ? 2 : 4,
  // How long each test took, to find the slow ones (test-results/durations.json).
  reporter: [['list'], ['json', { outputFile: 'test-results/durations.json' }]],
  projects: [
    { name: 'e2e', grepInvert: HEAVY },
    { name: 'heavy', grep: HEAVY, workers: 2 },
  ],
  use: {
    baseURL: live || 'http://localhost:5174/glue/',
    channel: process.env.PW_CHANNEL || 'msedge',
    // Kept out of Windows' Alt+Tab and activity history (e2e/launch.ts).
    launchOptions: { args: EDGE_ARGS },
    viewport: { width: 1920, height: 960 },
  },
  webServer: live ? undefined : [{
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:5174/glue/',
    reuseExistingServer: false,
    timeout: 120_000,
  }, {
    // GLUE Home's settings and service pages (home/ui), for e2e/home.spec.ts, with the stand-in for its native analysis
    // (e2e/home-analyse.ts), in .e2e-home: home/dist, which GLUE Home ships, never has it.
    command: 'npx vite build --config home/vite.config.ts --outDir ../../.e2e-home && npx vite build --config e2e/home-analyse.config.ts && npx vite preview --config home/vite.config.ts --outDir ../../.e2e-home',
    url: 'http://localhost:5176/index.html',
    reuseExistingServer: false,
    timeout: 120_000,
  }],
});
