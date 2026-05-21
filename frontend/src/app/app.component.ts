import { CommonModule, DOCUMENT } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import {
  NavigationCancel, NavigationEnd, NavigationError, NavigationStart, Router, RouterOutlet,
} from '@angular/router';

import { ConfirmService } from '@core/services/confirm.service';
import { ConfirmHostComponent, ToastHostComponent } from '@shared/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `
    @if (navigating()) {
      <div class="app-loader" role="status" aria-label="Cargando">
        <div class="app-loader__spinner"></div>
        <p class="app-loader__text">Cargando...</p>
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
      gap: var(--s-3);
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
      color: var(--text-muted);
      font-size: 14px;
      margin: 0;
    }
    @keyframes app-loader-spin { to { transform: rotate(360deg); } }
  `],
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly confirmSvc = inject(ConfirmService);

  /** Visible mientras el router está en una navegación (incluye guards async). */
  readonly navigating = signal(true);

  ngOnInit(): void {
    this.resetBodyState();

    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.navigating.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.navigating.set(false);
        this.confirmSvc.cancel();
        this.resetBodyState();

        // Si la navegación inicial falla (típicamente por chunk desactualizado
        // tras un deploy nuevo), recargar la página para forzar fetch del
        // nuevo index.html y sus chunks.
        if (event instanceof NavigationError && !this.router.navigated) {
          window.location.replace('/');
        }
      }
    });
  }

  private resetBodyState(): void {
    const body = this.doc.body;
    if (!body) return;
    body.style.overflow = '';
    body.style.pointerEvents = '';
    body.removeAttribute('aria-hidden');
  }
}
