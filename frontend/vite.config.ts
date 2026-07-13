import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  optimizeDeps: {
    exclude: ['@midnight-ntwrk/ledger-v8', '@midnight-ntwrk/onchain-runtime-v3', '@midnight-ntwrk/zkir-v2'],
  },
});
