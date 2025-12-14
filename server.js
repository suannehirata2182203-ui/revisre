const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Целевой сайт для проксирования
const TARGET_URL = process.env.TARGET_URL || 'https://beyondchargers.com';

// Настройки прокси (если требуется)
const USE_PROXY = process.env.USE_PROXY === 'true' || process.env.PROXY_USER;
let PROXY_CONFIG = null;
let proxyAgent = undefined;

if (USE_PROXY) {
  try {
    PROXY_CONFIG = {
      host: process.env.PROXY_HOST || '185.162.130.86',
      port: parseInt(process.env.PROXY_PORT || '10000'),
      auth: {
        username: process.env.PROXY_USER || 'UInVgOaurISMxHUOMkfD',
        password: process.env.PROXY_PASS || 'xnElmQSosaC9sekBD1SRzgqgBWcj2HsZ'
      }
    };
    const proxyUrl = `http://${PROXY_CONFIG.auth.username}:${PROXY_CONFIG.auth.password}@${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`;
    proxyAgent = new HttpsProxyAgent(proxyUrl);
    console.log(`✅ Proxy agent configured: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  } catch (error) {
    console.error(`❌ Error configuring proxy: ${error.message}`);
    console.log('⚠️  Continuing without proxy...');
    PROXY_CONFIG = null;
    proxyAgent = undefined;
  }
}

// Функция для создания прокси-конфигурации
const proxyOptions = {
  target: TARGET_URL,
  changeOrigin: true,
  secure: true,
  followRedirects: true,
  logLevel: process.env.NODE_ENV === 'production' ? 'warn' : 'debug',
  timeout: 30000, // 30 секунд таймаут
  proxyTimeout: 30000,
  // Если используется внешний прокси
  agent: proxyAgent,
  // Настройки для HTTP/HTTPS агентов
  httpAgent: proxyAgent || new http.Agent({ keepAlive: true }),
  httpsAgent: proxyAgent || new https.Agent({ keepAlive: true }),
  onProxyReq: (proxyReq, req, res) => {
    // Логирование запросов для образовательных целей
    console.log(`[PROXY] ${req.method} ${req.url} -> ${TARGET_URL}${req.url}`);
    
    // Удаляем заголовки, которые могут вызвать проблемы
    proxyReq.removeHeader('x-forwarded-host');
    proxyReq.removeHeader('x-forwarded-proto');
    
    // Устанавливаем правильные заголовки
    proxyReq.setHeader('Host', new URL(TARGET_URL).hostname);
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
    delete proxyRes.headers['x-content-type-options'];
    
    // Добавляем заголовок для образовательных целей
    proxyRes.headers['x-proxy-demo'] = 'Educational Purpose Only';
  },
  onError: (err, req, res) => {
    console.error('[PROXY ERROR]', err.message);
    console.error('[PROXY ERROR] Stack:', err.stack);
    
    if (!res.headersSent) {
      res.status(502).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Proxy Error</title>
          <style>
            body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
            .error { background: #f8d7da; border: 2px solid #dc3545; padding: 20px; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="error">
            <h2>⚠️ Proxy Error</h2>
            <p><strong>Error:</strong> ${err.message}</p>
            <p>The proxy server encountered an error while trying to connect to the target site.</p>
            <p><a href="/">← Back to home</a></p>
          </div>
        </body>
        </html>
      `);
    }
  }
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

// Middleware для обработки всех запросов
app.use((req, res, next) => {
  // Если это корневой путь без параметра proxy, показываем предупреждение
  if (req.path === '/' && req.method === 'GET' && !req.query.proxy) {
    return next();
  }
  
  // Для всех остальных запросов применяем прокси
  try {
    proxy(req, res, next);
  } catch (error) {
    console.error('[MIDDLEWARE ERROR]', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error', message: error.message });
    }
  }
});

// Обработка ошибок Express
app.use((err, req, res, next) => {
  console.error('[EXPRESS ERROR]', err);
  if (!res.headersSent) {
    res.status(500).json({ 
      error: 'Internal Server Error', 
      message: process.env.NODE_ENV === 'production' ? 'An error occurred' : err.message 
    });
  }
});

// Обработка необработанных ошибок
process.on('uncaughtException', (error) => {
  console.error('[UNCAUGHT EXCEPTION]', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Educational Reverse Proxy Server running on port ${PORT}`);
  console.log(`📡 Proxying to: ${TARGET_URL}`);
  if (PROXY_CONFIG) {
    console.log(`🔐 Using proxy: ${PROXY_CONFIG.host}:${PROXY_CONFIG.port}`);
  } else {
    console.log(`ℹ️  Direct connection (no proxy)`);
  }
  console.log(`⚠️  WARNING: This is for educational purposes only!`);
  console.log(`✅ Server is ready to accept connections`);
});

