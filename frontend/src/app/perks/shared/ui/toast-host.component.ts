/**
 * ToastHostComponent — renderiza la cola global de toasts.
 *
 * Vive dentro del shell (una única instancia). Consume el signal del
 * PerksToastService y anima entrada/salida con CSS.
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  inject,
} from '@angular/core';

import { PerksToastService, ToastVariant } from '../services/perks-toast.service';

@Component({
  selector: 'perks-toast-host',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    <div class="host" role="region" aria-label="Notificaciones">
      @for (t of toast.toasts(); track t.id) {
        <div class="toast" [attr.data-variant]="t.variant">
          <span class="toast__icon material-icons-outlined">
            {{ iconFor(t.variant) }}
          </span>
          <div class="toast__body">
            <div class="toast__title">{{ t.title }}</div>
            @if (t.description) {
              <div class="toast__desc">{{ t.description }}</div>
            }
          </div>
          <button type="button" class="toast__x"
                  (click)="toast.dismiss(t.id)"
                  aria-label="Cerrar">
            <span class="material-icons-outlined">close</span>
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    :host { display: contents; }

    .host {
      position: fixed;
      right: var(--p-space-7);
      bottom: var(--p-space-7);
      display: flex;
      flex-direction: column;
      gap: var(--p-space-4);
      z-index: 60;
      max-width: min(420px, calc(100vw - var(--p-space-7) * 2));
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: start;
      gap: var(--p-space-5);
      padding: var(--p-space-5) var(--p-space-6);
      background: var(--p-surface-elevated);
      border: 1px solid var(--p-border-subtle);
      border-radius: var(--p-radius-md);
      box-shadow: var(--p-shadow-lg);
      color: var(--p-text-primary);
      animation: toast-in var(--p-motion-slow) var(--p-ease-spring);
    }
    @keyframes toast-in {
      from { transform: translate(8px, 12px); opacity: 0; }
      to   { transform: translate(0, 0); opacity: 1; }
    }

    .toast__icon {
      font-size: 20px !important;
      margin-top: 2px;
    }
    .toast[data-variant="success"] .toast__icon { color: var(--p-state-success); }
    .toast[data-variant="error"]   .toast__icon { color: var(--p-state-danger); }
    .toast[data-variant="warning"] .toast__icon { color: var(--p-state-warning); }
    .toast[data-variant="info"]    .toast__icon { color: var(--p-state-info); }

    .toast__title {
      font-size: var(--p-text-md);
      font-weight: var(--p-weight-semibold);
      line-height: 1.25;
    }
    .toast__desc {
      margin-top: 2px;
      font-size: var(--p-text-sm);
      color: var(--p-text-secondary);
      line-height: var(--p-line-loose);
    }

    .toast__x {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px; height: 26px;
      background: transparent;
      border: none;
      color: var(--p-text-muted);
      border-radius: var(--p-radius-sm);
      cursor: pointer;
      transition: background var(--p-motion-fast) var(--p-ease-out);
    }
    .toast__x:hover {
      background: var(--p-surface-hover);
      color: var(--p-text-primary);
    }
    .toast__x .material-icons-outlined { font-size: 16px; }
  `],
})
export class ToastHostComponent {
  readonly toast = inject(PerksToastService);

  iconFor(variant: ToastVariant): string {
    return {
      success: 'check_circle',
      error: 'error',
      warning: 'warning',
      info: 'info',
    }[variant];
  }
}
