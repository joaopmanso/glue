import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Served from https://joaopmanso.github.io/glue/ (GitHub Pages project site).
export default defineConfig({
  base: '/glue/',
  plugins: [svelte()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  // GLUE Home's Rust build output is huge and locked while it builds: never watched.
  server: { port: 5174, watch: { ignored: ['**/home/src-tauri/target/**'] } },
  preview: { port: 5174 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
