import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const CG_SDK = 'https://sdk.crazygames.com/crazygames-sdk-v3.js';

export default defineConfig({
  // Relative paths so JS/CSS load when the game is hosted in a subdirectory
  // (CrazyGames CDN, portal preview, etc.). CrazyGames requires relative paths.
  base: './',
  plugins: [
    {
      name: 'crazygames-sdk-head',
      transformIndexHtml(html) {
        if (process.env.VITE_CRAZYGAMES !== 'true') return html;
        return html.replace(
          '</title>',
          `</title>\n    <script src="${CG_SDK}"></script>`,
        );
      },
    },
  ],
  resolve: {
    alias: {
      '@shared': fileURLToPath(new URL('../shared/src', import.meta.url)),
    },
  },
  build: {
    target: 'es2022',
    assetsInlineLimit: 8192,
  },
  server: {
    port: 5173,
    proxy: {
      '/ws': {
        target: 'ws://localhost:8080',
        ws: true,
      },
    },
  },
});
