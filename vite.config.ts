import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  server: { host: '0.0.0.0', port: 5173, strictPort: true, proxy: {
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
