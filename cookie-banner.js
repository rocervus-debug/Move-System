/*!
 * VELUM Cookie Banner v1.0
 * Notice simple cumple LFPDPPP (MX) + LGPD (BR).
 * Uso: <script src="/cookie-banner.js" defer></script>
 *
 * Expone window.velumConsent = { essential, analytics, marketing, timestamp }
 * Dispara evento 'velum-consent-changed' al body cuando el user decide.
 * Lee/guarda decision en localStorage con clave 'velum_consent_v1' (vigencia 365 días).
 */
(function(){
  'use strict';
  if (window.__VELUM_COOKIE_BANNER_LOADED__) return;
  window.__VELUM_COOKIE_BANNER_LOADED__ = true;

  var STORAGE_KEY = 'velum_consent_v1';
  var VIGENCIA_DAYS = 365;
  var POLITICA_URL = '/privacidad';

  function readConsent(){
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var data = JSON.parse(raw);
      var ageMs = Date.now() - (data.timestamp || 0);
      if (ageMs > VIGENCIA_DAYS * 86400 * 1000) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return data;
    } catch(e){ return null; }
  }

  function writeConsent(level){
    var consent = {
      essential: true,
      analytics: level === 'all',
      marketing: level === 'all',
      level: level,
      timestamp: Date.now()
    };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(consent)); } catch(e){}
    window.velumConsent = consent;
    try {
      document.body.dispatchEvent(new CustomEvent('velum-consent-changed', { detail: consent }));
    } catch(e){}
    return consent;
  }

  function applyConsent(consent){
    window.velumConsent = consent;
    // Google Consent Mode v2: avisar a GA/GTM
    try {
      window.dataLayer = window.dataLayer || [];
      function gtag(){ window.dataLayer.push(arguments); }
      window.gtag = window.gtag || gtag;
      gtag('consent', 'update', {
        ad_storage:           consent.marketing ? 'granted' : 'denied',
        ad_user_data:         consent.marketing ? 'granted' : 'denied',
        ad_personalization:   consent.marketing ? 'granted' : 'denied',
        analytics_storage:    consent.analytics ? 'granted' : 'denied',
        functionality_storage: 'granted',
        security_storage:     'granted'
      });
    } catch(e){}
    // Meta Pixel: si user no acepta marketing, deshabilitar tracking
    try {
      if (!consent.marketing && window.fbq) {
        window.fbq('consent', 'revoke');
      } else if (consent.marketing && window.fbq) {
        window.fbq('consent', 'grant');
      }
    } catch(e){}
  }

  function buildBanner(){
    var existing = document.getElementById('velum-cookie-banner');
    if (existing) return existing;
    var div = document.createElement('div');
    div.id = 'velum-cookie-banner';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-label', 'Aviso de cookies');
    div.innerHTML =
      '<div class="vcb-inner">' +
        '<div class="vcb-text">' +
          '<strong>Usamos cookies</strong> esenciales para el funcionamiento del sitio y, con tu consentimiento, cookies de analítica y marketing para mejorar el servicio. ' +
          '<a href="' + POLITICA_URL + '" target="_blank">Política de privacidad</a>' +
        '</div>' +
        '<div class="vcb-actions">' +
          '<button type="button" class="vcb-btn vcb-btn-secondary" data-consent="essential">Solo esenciales</button>' +
          '<button type="button" class="vcb-btn vcb-btn-primary" data-consent="all">Aceptar todo</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(div);
    div.querySelector('[data-consent="essential"]').addEventListener('click', function(){
      var c = writeConsent('essential');
      applyConsent(c);
      hideBanner();
    });
    div.querySelector('[data-consent="all"]').addEventListener('click', function(){
      var c = writeConsent('all');
      applyConsent(c);
      hideBanner();
    });
    return div;
  }

  function showBanner(){
    var b = buildBanner();
    requestAnimationFrame(function(){
      b.classList.add('vcb-visible');
    });
  }

  function hideBanner(){
    var b = document.getElementById('velum-cookie-banner');
    if (!b) return;
    b.classList.remove('vcb-visible');
    setTimeout(function(){ if (b.parentNode) b.parentNode.removeChild(b); }, 320);
  }

  function injectStyles(){
    if (document.getElementById('velum-cookie-banner-styles')) return;
    var style = document.createElement('style');
    style.id = 'velum-cookie-banner-styles';
    style.textContent =
      '#velum-cookie-banner{position:fixed;left:0;right:0;bottom:0;z-index:99999;' +
      'background:rgba(8,18,30,.97);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
      'border-top:1px solid rgba(0,212,255,.25);color:#e8edf5;' +
      'transform:translateY(110%);transition:transform .32s cubic-bezier(.4,0,.2,1);' +
      "font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.5;}" +
      '#velum-cookie-banner.vcb-visible{transform:translateY(0);}' +
      '.vcb-inner{max-width:1200px;margin:0 auto;padding:16px 24px;display:flex;align-items:center;gap:24px;flex-wrap:wrap;}' +
      '.vcb-text{flex:1;min-width:280px;color:#c9d3e2;}' +
      '.vcb-text strong{color:#fff;}' +
      '.vcb-text a{color:#66E8FF;text-decoration:underline;text-underline-offset:2px;}' +
      '.vcb-actions{display:flex;gap:10px;flex-wrap:wrap;}' +
      '.vcb-btn{font:inherit;font-size:13px;font-weight:600;padding:9px 18px;border-radius:8px;cursor:pointer;border:none;' +
      'transition:transform .15s ease, opacity .15s ease;letter-spacing:.2px;}' +
      '.vcb-btn:hover{transform:translateY(-1px);}' +
      '.vcb-btn:active{transform:translateY(0);}' +
      '.vcb-btn-secondary{background:rgba(255,255,255,.07);color:#c9d3e2;border:1px solid rgba(255,255,255,.12);}' +
      '.vcb-btn-secondary:hover{background:rgba(255,255,255,.12);}' +
      '.vcb-btn-primary{background:linear-gradient(135deg,#00D4FF,#0099CC);color:#04101a;}' +
      '.vcb-btn-primary:hover{box-shadow:0 6px 20px rgba(0,212,255,.4);}' +
      '@media (max-width:560px){' +
      '  .vcb-inner{padding:14px 16px;gap:14px;}' +
      '  .vcb-text{font-size:13px;}' +
      '  .vcb-actions{width:100%;}' +
      '  .vcb-btn{flex:1;text-align:center;}' +
      '}';
    document.head.appendChild(style);
  }

  function init(){
    // Set default consent (denied) ASAP for Google Consent Mode v2
    try {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push(['consent', 'default', {
        ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied',
        analytics_storage: 'denied', functionality_storage: 'granted', security_storage: 'granted',
        wait_for_update: 500
      }]);
    } catch(e){}

    var existing = readConsent();
    if (existing) {
      applyConsent(existing);
      return; // No mostrar banner si ya decidió en últimos 365 días
    }
    if (document.body) {
      injectStyles();
      showBanner();
    } else {
      document.addEventListener('DOMContentLoaded', function(){
        injectStyles();
        showBanner();
      });
    }
  }

  // API pública: window.velumOpenCookieSettings() para que apps puedan re-mostrar el banner
  window.velumOpenCookieSettings = function(){
    try { localStorage.removeItem(STORAGE_KEY); } catch(e){}
    window.velumConsent = null;
    injectStyles();
    showBanner();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
