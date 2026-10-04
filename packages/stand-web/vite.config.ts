import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const stand = 'http://localhost:3100';

export default defineConfig({
  plugins: [react()],
  build: { outDir: '../stand/public', emptyOutDir: true },
  server: { proxy: { '/scenario': stand, '/test': stand, '/health': stand } },
});
