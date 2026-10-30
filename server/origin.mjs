function originOf(value) {
  if (!value || typeof value !== 'string' || value.includes(',')) return null;
  try {
    const url = new URL(value);
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    return url.origin;
  } catch { return null; }
}

export function protectOrigins(app, { appOrigin, trustProxy = 'loopback', production = false } = {}) {
  const configured = appOrigin ? originOf(appOrigin.trim()) : null;
  if (appOrigin && !configured) throw new Error('APP_ORIGIN phải là một origin HTTP/HTTPS hợp lệ, chỉ gồm giao thức, hostname và cổng.');
  if (trustProxy === 'true' || trustProxy === '1' || trustProxy === true) throw new Error('TRUST_PROXY cần IP hoặc CIDR của proxy tin cậy, không dùng true cho mọi nguồn.');
  app.set('trust proxy', trustProxy === 'false' || trustProxy === '0' ? false : trustProxy);

  app.use('/api', (req, res, next) => {
    if (['GET','HEAD','OPTIONS'].includes(req.method)) return next();
    const incoming = req.get('origin');
    if (incoming) {
      const actual = originOf(incoming);
      const protocol = req.socket.encrypted ? 'https' : 'http';
      const allowed = new Set([configured, originOf(`${protocol}://${req.get('host')}`)]);
      const trustedPeer = app.get('trust proxy fn')?.(req.socket.remoteAddress, 0);
      if (trustedPeer) {
        const host = req.get('x-forwarded-host') || req.get('host');
        const forwardedProtocol = req.get('x-forwarded-proto') || protocol;
        if (['http','https'].includes(forwardedProtocol)) allowed.add(originOf(`${forwardedProtocol}://${host}`));
      }
      // Normal development uses Vite too; this is independent of demo authentication.
      if (!production) for (const host of ['localhost','127.0.0.1','[::1]']) allowed.add(`http://${host}:5173`);
      if (!actual || !allowed.has(actual)) return res.status(403).json({ code: 'ORIGIN_NOT_ALLOWED', message: 'Địa chỉ website chưa khớp cấu hình máy chủ. Hãy kiểm tra proxy hoặc APP_ORIGIN.' });
    }
    if (!req.path.startsWith('/v1/public/') && req.get('X-Requested-With') !== 'SuperNet') return res.status(403).json({ message: 'Thiếu xác nhận nguồn yêu cầu.' });
    next();
  });
}
