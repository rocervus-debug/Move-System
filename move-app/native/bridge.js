/**
 * VELUM Native Bridge
 * Inyectado en atleta.html cuando corre dentro de Capacitor.
 * Activa: haptics, status bar, back button, local notifications,
 *         network detection, share nativo.
 *
 * Todos los métodos son no-ops seguros si Capacitor no está presente
 * (es decir, si el usuario abre el portal desde el browser normal).
 */

(function () {
  /* ─── Detección ─────────────────────────────── */
  const IS_NATIVE = typeof window.Capacitor !== 'undefined'
                    && window.Capacitor.isNativePlatform();
  const IS_IOS     = IS_NATIVE && window.Capacitor.getPlatform() === 'ios';
  const IS_ANDROID = IS_NATIVE && window.Capacitor.getPlatform() === 'android';

  window._isNative = IS_NATIVE;

  if (!IS_NATIVE) return; // En browser: no hacer nada

  const { Haptics, StatusBar, SplashScreen, App,
          LocalNotifications, Network, Share } = window.Capacitor.Plugins;

  /* ─── 1. Status bar ─────────────────────────── */
  if (StatusBar) {
    StatusBar.setStyle({ style: 'DARK' }).catch(() => {});
    if (IS_ANDROID) {
      StatusBar.setBackgroundColor({ color: '#04120f' }).catch(() => {});
      StatusBar.setOverlaysWebView({ overlay: false }).catch(() => {});
    }
  }

  /* ─── 2. Splash screen hide ─────────────────── */
  if (SplashScreen) {
    // Se auto-oculta según config, pero forzamos al tener la UI lista
    window.addEventListener('velum:appReady', () => {
      SplashScreen.hide({ fadeOutDuration: 400 }).catch(() => {});
    });
  }

  /* ─── 3. Haptic feedback ────────────────────── */
  /**
   * window.haptic(style)
   * style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error'
   */
  window.haptic = function (style) {
    if (!Haptics) return;
    style = style || 'light';
    if (style === 'success' || style === 'warning' || style === 'error') {
      const NotificationType = { success: 'SUCCESS', warning: 'WARNING', error: 'ERROR' };
      Haptics.notification({ type: NotificationType[style] }).catch(() => {});
    } else {
      const ImpactStyle = { light: 'LIGHT', medium: 'MEDIUM', heavy: 'HEAVY' };
      Haptics.impact({ style: ImpactStyle[style] || 'LIGHT' }).catch(() => {});
    }
  };

  /* ─── 4. Haptics automáticos en elementos UI ── */
  document.addEventListener('touchstart', function (e) {
    const el = e.target.closest(
      '.qa, .cls-btn, .bn-item, .bn-fab-wrap, .mas-item, ' +
      '.btn, .bcs-wa-btn, .bcs-close-btn, .mhw-action, ' +
      '.proxima-clase-card, .sheet-close, .pc-badge'
    );
    if (el) window.haptic('light');
  }, { passive: true });

  /* ─── 5. Android back button ────────────────── */
  if (App) {
    App.addListener('backButton', function ({ canGoBack }) {
      // Cierra sheets abiertos primero
      const openSheet = document.querySelector('.sheet-backdrop.open');
      if (openSheet) {
        openSheet.classList.remove('open');
        document.body.style.overflow = '';
        return;
      }
      // Navega al home si hay otra vista activa
      const active = document.querySelector('.view.active');
      if (active && active.id !== 'view-home') {
        if (typeof window.switchView === 'function') window.switchView('home');
        return;
      }
      // En home: minimiza la app (Android UX estándar)
      App.minimizeApp().catch(() => {});
    });

    // App a primer plano: refrescar datos si lleva >5 min en background
    let _bgTs = null;
    App.addListener('appStateChange', function ({ isActive }) {
      if (!isActive) {
        _bgTs = Date.now();
      } else if (_bgTs && Date.now() - _bgTs > 5 * 60 * 1000) {
        // Más de 5 min en background: refrescar silenciosamente
        if (typeof window._velumRefresh === 'function') window._velumRefresh();
        _bgTs = null;
      }
    });
  }

  /* ─── 6. Local notifications (recordatorios de clase) ── */
  /**
   * window.scheduleClassReminder(tipo, hora, fechaStr)
   * Agenda una notificación local 1 hora antes de la clase.
   * Requiere que el usuario haya dado permiso.
   */
  window.scheduleClassReminder = async function (tipo, hora, fechaStr) {
    if (!LocalNotifications) return;
    try {
      const perm = await LocalNotifications.requestPermissions();
      if (perm.display !== 'granted') return;

      // Build Date for the class
      // hora puede ser "6:00am" o "06:00" — normalizamos
      const horaClean = hora.replace(/[apm]/gi, '').trim(); // "6:00" o "06:00"
      const [hh, mm]  = horaClean.split(':').map(Number);
      const isPM       = /pm/i.test(hora) && hh !== 12;
      const h24        = isPM ? hh + 12 : (hh === 12 && /am/i.test(hora) ? 0 : hh);

      const claseDate = new Date(`${fechaStr}T${String(h24).padStart(2,'0')}:${String(mm||0).padStart(2,'0')}:00`);
      const reminderDate = new Date(claseDate.getTime() - 60 * 60 * 1000);

      if (reminderDate <= new Date()) return; // Ya pasó

      const id = Math.abs(
        (fechaStr + hora + tipo).split('').reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0)
      ) % 2147483647;

      await LocalNotifications.schedule({
        notifications: [{
          id,
          title:  `Tu clase de ${tipo} es en 1 hora`,
          body:   `${claseDate.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' })} — ¡No olvides tu agua y equipo!`,
          schedule: { at: reminderDate },
          smallIcon: 'ic_stat_velum',
          iconColor: '#5DCAA5',
          extra: { tipo, hora, fecha: fechaStr }
        }]
      });
    } catch (e) {
      console.warn('[Bridge] scheduleClassReminder:', e);
    }
  };

  /**
   * Cancela el recordatorio de una clase (llamar al cancelar reserva)
   */
  window.cancelClassReminder = async function (tipo, hora, fechaStr) {
    if (!LocalNotifications) return;
    try {
      const id = Math.abs(
        (fechaStr + hora + tipo).split('').reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0)
      ) % 2147483647;
      await LocalNotifications.cancel({ notifications: [{ id }] });
    } catch (e) {}
  };

  /* ─── 7. Share nativo ───────────────────────── */
  /**
   * window.nativeShare(title, text, url)
   * Usa el share sheet nativo de iOS/Android en lugar de copiar al clipboard.
   */
  window.nativeShare = async function (title, text, url) {
    if (!Share) return false;
    try {
      await Share.share({ title, text, url, dialogTitle: title });
      return true;
    } catch (e) {
      return false;
    }
  };

  /* ─── 8. Network status ─────────────────────── */
  if (Network) {
    Network.addListener('networkStatusChange', function (status) {
      if (!status.connected) {
        // Banner de offline
        let banner = document.getElementById('native-offline-banner');
        if (!banner) {
          banner = document.createElement('div');
          banner.id = 'native-offline-banner';
          banner.style.cssText = [
            'position:fixed;top:0;left:0;right:0;z-index:9999',
            'background:#ef4444;color:#fff;font-size:12px;font-weight:700',
            'text-align:center;padding:8px;letter-spacing:.3px'
          ].join(';');
          banner.textContent = 'Sin conexión a internet';
          document.body.appendChild(banner);
        }
        banner.style.display = 'block';
      } else {
        const banner = document.getElementById('native-offline-banner');
        if (banner) banner.style.display = 'none';
      }
    });
  }

  /* ─── 9. iOS safe-area meta override ────────── */
  // Capacitor ya lo maneja, pero forzamos por si hay edge cases
  if (IS_IOS) {
    const vp = document.querySelector('meta[name=viewport]');
    if (vp) {
      const content = vp.getAttribute('content');
      if (!content.includes('viewport-fit')) {
        vp.setAttribute('content', content + ', viewport-fit=cover');
      }
    }
  }

  /* ─── 10. Señal "app lista" al hide splash ── */
  // La emitimos cuando el portal ha terminado su init
  window._nativeBridgeReady = true;

  console.log('[VELUM Bridge] Loaded — platform:', window.Capacitor.getPlatform());
})();
