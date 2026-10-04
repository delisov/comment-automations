import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

const apiPaths = ['/accounts', '/automations', '/runs', '/test', '/health'];

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../api/public', emptyOutDir: true },
  server: {
    proxy: Object.fromEntries(apiPaths.map((path) => [path, 'http://localhost:3000'])),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
