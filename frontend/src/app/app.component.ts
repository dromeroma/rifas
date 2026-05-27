import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import {
  NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet,
} from '@angular/router';

import { ConfirmService } from '@core/services/confirm.service';
import { ShortcutsService } from '@core/services/shortcuts.service';
import { ConfirmHostComponent, ToastHostComponent } from '@shared/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `
    @if (navigating()) {
      <div class="app-loader" role="status" aria-label="Cargando">
        <div class="app-loader__spinner"></div>
        <p class="app-loader__text">{{ loaderMessage() }}</p>
        @if (loaderHint(); as hint) {
          <small class="app-loader__hint">{{ hint }}</small>
        }
      </div>
    }
    <router-outlet />
    <app-toast-host />
    <app-confirm-host />
  `,
  styles: [`
    .app-loader {
      position: fixed; inset: 0;
      display: grid; place-items: center;
      align-content: center;
      gap: var(--s-2);
      background: var(--bg-base);
      z-index: 9999;
    }
    .app-loader__spinner {
      width: 48px; height: 48px;
      border: 4px solid var(--bg-hover);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: app-loader-spin 0.8s linear infinite;
    }
    .app-loader__text {
      color: var(--text);
      font-size: 15px;
      margin: var(--s-2) 0 0;
      font-weight: 500;
    }
    .app-loader__hint {
      color: var(--text-muted);
      font-size: 12px;
      max-width: 320px;
      text-align: center;
      line-height: 1.5;
      padding: 0 var(--s-3);
    }
    @keyframes app-loader-spin { to { transform: rotate(360deg); } }
  `],
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly shortcuts = inject(ShortcutsService);

  /** Visible mientras el router está en una navegación (incluye guards async).
   *  Arranca en false — si la primera navegación tarda, NavigationStart la
   *  pone en true. Antes arrancaba en true y, si nos perdíamos NavigationEnd
   *  (timing entre el subscribe en ngOnInit y el primer evento del router),
   *  quedaba enganchada cubriendo todo con un overlay del color del fondo
   *  y se veía pantalla negra al entrar directo a una ruta lazy-loaded. */
  readonly navigating = signal(false);
  /** Segundos transcurridos desde que empezó la navegación actual. */
  readonly elapsed = signal(0);
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private navStartAt = 0;

  /** Mensaje principal del spinner, escalado según el tiempo transcurrido.
   *  Da feedback útil cuando Render free está dormido (cold start ~30s). */
  readonly loaderMessage = computed(() => {
    const s = this.elapsed();
    if (s < 3) return 'Cargando...';
    if (s < 8) return 'Conectando al servidor...';
    if (s < 20) return 'El servidor estaba dormido, está despertando...';
    return 'Casi listo, dale unos segundos más...';
  });

  /** Hint secundario explicativo cuando la espera se alarga. */
  readonly loaderHint = computed<string | null>(() => {
    const s = this.elapsed();
    if (s < 8) return null;
    return 'Esto solo pasa cuando nadie usó la app en los últimos 15 minutos. La próxima vez será instantáneo.';
  });

  ngOnInit(): void {
    this.resetBodyState();
    this.shortcuts.install();

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.startNavTimer();
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.stopNavTimer();
        this.confirmSvc.cancel();
        this.resetBodyState();

        if (event instanceof NavigationError && !this.router.navigated) {
          window.location.replace('/');
        }
      }
    });
  }

  private startNavTimer(): void {
    this.navigating.set(true);
    this.elapsed.set(0);
    this.navStartAt = Date.now();
    this.clearTick();
    this.intervalId = setInterval(() => {
      this.elapsed.set(Math.floor((Date.now() - this.navStartAt) / 1000));
    }, 1000);
  }

  private stopNavTimer(): void {
    this.clearTick();
    this.navigating.set(false);
    this.elapsed.set(0);
  }

  private clearTick(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  private resetBodyState(): void {
    const body = this.doc.body;
    if (!body) return;
    body.style.overflow = '';
    body.style.pointerEvents = '';
    body.removeAttribute('aria-hidden');
  }
}
