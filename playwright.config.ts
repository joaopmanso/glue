import { defineConfig } from '@playwright/test';

// Runs against the production build under /mco/, the way GitHub Pages serves it.
// Uses the installed Microsoft Edge (channel 'msedge'), so no browser download is needed.
export default defineConfig({
  testDir: 'e2e',
  timeout: 120_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:5174/mco/',
    channel: process.env.PW_CHANNEL || 'msedge',
    viewport: { width: 1920, height: 960 },
  },
  webServer: {
    command: 'npm run build && npm run preview -- --strictPort',
    url: 'http://localhost:5174/mco/',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
