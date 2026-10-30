import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream, readFileSync, readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
function pdfAssets(): Plugin {
  const root = fileURLToPath(new URL('./node_modules/pdfjs-dist/',import.meta.url));
  return {
    name:'local-pdf-assets',
    generateBundle() {
      for (const directory of ['cmaps','standard_fonts','wasm']) for (const entry of readdirSync(resolve(root,directory),{withFileTypes:true})) {
        if (entry.isFile()) this.emitFile({type:'asset',fileName:`pdfjs/${directory}/${entry.name}`,source:readFileSync(resolve(root,directory,entry.name))});
      }
    },
    configureServer(server) {
      server.middlewares.use((request,response,next) => {
        const match = request.url?.split('?')[0].match(/^\/pdfjs\/(cmaps|standard_fonts|wasm)\/([a-zA-Z0-9_.-]+)$/);
        if (!match) return next();
        const path = resolve(root,match[1],match[2]);
        if (match[2].startsWith('.') || !existsSync(path)) { response.statusCode = 404; response.end(); return; }
        response.setHeader('Content-Type',match[2].endsWith('.wasm') ? 'application/wasm' : match[2].endsWith('.js') ? 'text/javascript' : 'application/octet-stream');
        createReadStream(path).on('error',() => { response.statusCode = 404; response.end(); }).pipe(response);
      });
    },
  };
}
export default defineConfig({
  plugins: [react(),pdfAssets()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true,
    fs: {deny:['.env','.env.*','*.{crt,pem}','**/.git/**','**/.data/**']}, proxy: {
    '/api': {
      target: 'http://127.0.0.1:3000', changeOrigin: true,
      configure(proxy) {
        proxy.on('proxyReq', (proxyRequest, request) => {
          // Preserve the browser-facing address even though the API Host is rewritten.
          // Overwrite client-supplied forwarding headers rather than trusting them.
          if (request.headers.host) proxyRequest.setHeader('X-Forwarded-Host', request.headers.host);
          else proxyRequest.removeHeader('X-Forwarded-Host');
          const protocol = request.headers['x-forwarded-proto'];
          proxyRequest.setHeader('X-Forwarded-Proto', typeof protocol === 'string' && ['http','https'].includes(protocol) ? protocol : 'encrypted' in request.socket && request.socket.encrypted ? 'https' : 'http');
          proxyRequest.setHeader('X-Forwarded-For', request.socket.remoteAddress || '127.0.0.1');
        });
      },
    },
  } },
});
