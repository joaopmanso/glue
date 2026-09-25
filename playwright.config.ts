import { defineConfig } from '@playwright/test';

// By default runs against the production build under /glue/, the way GitHub Pages serves it.
// BASE_URL=https://joaopmanso.github.io/glue/ runs the same tests against the live site.
// Uses the installed Microsoft Edge (channel 'msedge'), so no browser download is needed.
const live = process.env.BASE_URL;
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: live || 'http://localhost:5174/glue/',
    channel: process.env.PW_CHANNEL || 'msedge',
    viewport: { width: 1920, height: 960 },
  },
  webServer: live ? undefined : [{
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:5174/glue/',
    reuseExistingServer: true,
    timeout: 120_000,
  }, {
    // GLUE Home's settings and service pages (home/ui), for e2e/home.spec.ts.
    command: 'npm run home:ui && npm run home:preview',
    url: 'http://localhost:5176/index.html',
    reuseExistingServer: true,
    timeout: 120_000,
  }],
});
