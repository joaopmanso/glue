import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// Served from https://joaopmanso.github.io/mco/ (GitHub Pages project site).
export default defineConfig({
  base: '/mco/',
  plugins: [svelte()],
  worker: { format: 'es' },
  build: { target: 'es2022', sourcemap: true },
  server: { port: 5174 },
  preview: { port: 5174 },
  test: { include: ['tests/**/*.test.ts'], environment: 'node' },
});
