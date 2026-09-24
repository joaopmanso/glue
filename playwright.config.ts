import { defineConfig } from '@playwright/test';

// By default runs against the production build under /mco/, the way GitHub Pages serves it.
// BASE_URL=https://joaopmanso.github.io/mco/ runs the same tests against the live site.
// Uses the installed Microsoft Edge (channel 'msedge'), so no browser download is needed.
const live = process.env.BASE_URL;
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: live || 'http://localhost:5174/mco/',
    channel: process.env.PW_CHANNEL || 'msedge',
    viewport: { width: 1920, height: 960 },
  },
  webServer: live ? undefined : {
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:5174/mco/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
