// GLUE Home's web part (ADR 0044): the settings window and the hidden service window.
// `npm run home:ui` builds it into home/dist, which the Tauri app ships.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { fileURLToPath } from 'node:url';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  root: here('./ui'),
  base: './',
  plugins: [svelte()],
  server: { port: 5176, strictPort: true, watch: { ignored: ['**/src-tauri/target/**'] } },
  preview: { port: 5176, strictPort: true },
  build: {
    outDir: here('./dist'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: { input: { index: here('./ui/index.html'), service: here('./ui/service.html'), dock: here('./ui/dock.html') } },
  },
});
