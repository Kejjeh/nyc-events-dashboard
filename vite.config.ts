/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Project is served from https://<user>.github.io/nyc-events-dashboard/
export default defineConfig({
  base: '/nyc-events-dashboard/',
  plugins: [react()],
  test: {
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
