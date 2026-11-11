import { networkInterfaces } from 'node:os';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/** First private IPv4 of this machine, so invite links / QR codes work on phones in the same Wi-Fi. */
function lanAddress(): string {
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) {
      if (a.family === 'IPv4' && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)) return a.address;
    }
  }
  return '';
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: true },
  define: { __LAN_HOST__: JSON.stringify(lanAddress()) },
  build: {
    // three.js alone is ~700 kB; vendor chunks change rarely and stay cached between releases.
    chunkSizeWarningLimit: 900,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            { name: 'three', test: /node_modules[\/]three[\/]/, priority: 30 },
            { name: 'r3f', test: /node_modules[\/](@react-three|postprocessing|three-stdlib|maath|@monogrid|camera-controls)/, priority: 20 },
            { name: 'react', test: /node_modules[\/](react|react-dom|react-router|scheduler|zustand)[\/]/, priority: 10 },
            { name: 'net', test: /node_modules[\/](@colyseus|qrcode)/, priority: 10 },
          ],
        },
      },
    },
  },
});
