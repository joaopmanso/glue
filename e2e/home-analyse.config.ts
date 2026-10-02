// The tests' stand-in for GLUE Home's native analysis (e2e/home-analyse.ts), built next to GLUE Home's pages for the
// e2e server (playwright.config.ts: `.e2e-home/`, never home/dist): same origin, so its analysis workers can start.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: './',
  publicDir: false,
  worker: { format: 'es' },
  build: {
    outDir: here('../.e2e-home/__e2e'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: here('./home-analyse.ts'), preserveEntrySignatures: 'strict', output: { entryFileNames: 'home-analyse.js' } },
  },
});
