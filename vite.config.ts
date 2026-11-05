import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import fs from 'node:fs';
import type { Plugin } from 'vite';

/** Serve immutable reference-template at /reference-preview/ for DESIGN_PARITY checks. */
function referencePreview(): Plugin {
  const root = path.resolve(import.meta.dirname, 'reference-template');
  return {
    name: 'reference-preview',
    configureServer(server) {
      server.middlewares.use('/reference-preview', (req, res, next) => {
        try {
          const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
          const rel = urlPath === '/' ? '/index.html' : urlPath;
          const file = path.normalize(path.join(root, rel));
          if (!file.startsWith(root)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
          }
          if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
            next();
            return;
          }
          const ext = path.extname(file);
          const types: Record<string, string> = {
            '.html': 'text/html; charset=utf-8',
            '.js': 'text/javascript; charset=utf-8',
            '.css': 'text/css; charset=utf-8',
          };
          res.setHeader('Content-Type', types[ext] || 'application/octet-stream');
          fs.createReadStream(file).pipe(res);
        } catch {
          next();
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), referencePreview()],
  server: {
    port: 5173,
    host: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${process.env.RECEIPT_REPLAY_PORT || 8787}`,
      },
    },
  },
});
