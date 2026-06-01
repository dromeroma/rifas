import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { Toast, ToastService, ToastType } from '@core/services/toast.service';

@Component({
  selector: 'app-toast-host',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="host" role="region" aria-live="polite" aria-label="Notificaciones">
      @for (t of toast.toasts(); track t.id) {
        <article
          class="toast toast--{{ t.type }}"
          [class.toast--removing]="t.removing"
          role="status"
        >
          <span class="toast__icon material-icons" aria-hidden="true">{{ icon(t.type) }}</span>
          <div class="toast__body">
            <strong>{{ t.title }}</strong>
            @if (t.message) { <small>{{ t.message }}</small> }
          </div>
          <button class="toast__close" (click)="toast.dismiss(t.id)" aria-label="Cerrar notificación">
            <span class="material-icons">close</span>
          </button>
          <span class="toast__bar" [style.animation-duration.ms]="t.duration"></span>
        </article>
      }
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .host {
      position: fixed;
      bottom: var(--s-4);
      right: var(--s-4);
      z-index: var(--z-toast);
      display: flex;
      flex-direction: column;
      gap: var(--s-2);
      width: 360px;
      max-width: calc(100vw - 32px);
      pointer-events: none;
    }

    /* Los elementos position:fixed se repiten en CADA hoja al imprimir.
       Si el admin imprime mientras hay un toast visible (ej. 'Marcadas
       como impresas'), el texto aparece en todas las hojas. Lo ocultamos
       en print para que no contamine la salida física. */
    @media print {
      .host { display: none !important; }
    }

    .toast {
      pointer-events: auto;
      position: relative;
      overflow: hidden;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: flex-start;
      gap: var(--s-3);
      padding: 12px 40px 14px 14px;
      background: var(--bg-elevated);
      color: var(--text);
      border: 1px solid var(--border);
      border-left: 4px solid var(--accent);
      border-radius: var(--r-md);
      box-shadow: var(--shadow-lg), 0 0 0 1px rgba(0, 0, 0, 0.04);
      backdrop-filter: blur(8px);
      animation: toast-in 320ms cubic-bezier(0.16, 1, 0.3, 1);
      max-height: 200px;
      transition:
        max-height 320ms cubic-bezier(0.4, 0, 0.2, 1),
        opacity 220ms ease,
        transform 280ms cubic-bezier(0.16, 1, 0.3, 1),
        padding 280ms cubic-bezier(0.4, 0, 0.2, 1),
        border-color 220ms;
    }

    .toast--removing {
      max-height: 0;
      opacity: 0;
      transform: translateX(40px);
      padding-top: 0;
      padding-bottom: 0;
      border-top-width: 0;
      border-bottom-width: 0;
      box-shadow: none;
    }

    /* Iconos y colores por tipo */
    .toast__icon {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      display: grid;
      place-items: center;
      font-size: 16px !important;
      flex-shrink: 0;
      margin-top: 2px;
    }

    .toast--success { border-left-color: var(--accent); }
    .toast--success .toast__icon { background: var(--accent-soft); color: var(--accent); }
    .toast--error   { border-left-color: var(--danger); }
    .toast--error   .toast__icon { background: var(--danger-soft); color: var(--danger); }
    .toast--info    { border-left-color: var(--info); }
    .toast--info    .toast__icon { background: var(--info-soft); color: var(--info); }
    .toast--warning { border-left-color: var(--warning); }
    .toast--warning .toast__icon { background: var(--warning-soft); color: var(--warning); }

    .toast__body {
      display: grid;
      gap: 2px;
      min-width: 0;
    }
    .toast__body strong {
      font-size: 13px;
      font-weight: 600;
      color: var(--text);
      line-height: 1.3;
    }
    .toast__body small {
      font-size: 12px;
      color: var(--text-muted);
      line-height: 1.4;
      word-wrap: break-word;
    }

    .toast__close {
      position: absolute;
      top: 8px;
      right: 8px;
      width: 26px;
      height: 26px;
      background: transparent;
      border: 0;
      border-radius: 50%;
      color: var(--text-faint);
      cursor: pointer;
      display: grid;
      place-items: center;
      transition: background var(--t-fast), color var(--t-fast);
    }
    .toast__close:hover { background: var(--bg-hover); color: var(--text); }
    .toast__close .material-icons { font-size: 16px; }

    /* Barra de progreso: cuenta atrás visualmente */
    .toast__bar {
      position: absolute;
      left: 0;
      bottom: 0;
      width: 100%;
      height: 3px;
      background: currentColor;
      transform-origin: left center;
      animation-name: toast-progress;
      animation-timing-function: linear;
      animation-fill-mode: forwards;
      opacity: 0.7;
    }
    .toast--success .toast__bar { color: var(--accent); }
    .toast--error   .toast__bar { color: var(--danger); }
    .toast--info    .toast__bar { color: var(--info); }
    .toast--warning .toast__bar { color: var(--warning); }
    .toast--removing .toast__bar { animation-play-state: paused; }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateX(60px) scale(0.95);
        max-height: 0;
      }
      to {
        opacity: 1;
        transform: translateX(0) scale(1);
        max-height: 200px;
      }
    }

    @keyframes toast-progress {
      from { transform: scaleX(1); }
      to   { transform: scaleX(0); }
    }

    /* Mobile: full width arriba del bottom-nav */
    @media (max-width: 719px) {
      .host {
        left: var(--s-3);
        right: var(--s-3);
        bottom: calc(var(--h-bottom-nav) + var(--s-3) + env(safe-area-inset-bottom, 0px));
        width: auto;
        max-width: none;
      }
    }
  `],
})
export class ToastHostComponent {
  readonly toast = inject(ToastService);

  icon(type: ToastType): string {
    return ({
      success: 'check_circle',
      error: 'error_outline',
      info: 'info',
      warning: 'warning_amber',
    } as Record<ToastType, string>)[type];
  }
}
