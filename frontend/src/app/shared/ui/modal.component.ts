import { CommonModule } from '@angular/common';
import {
  Component, EventEmitter, HostListener, OnDestroy,
  Output, effect, input,
} from '@angular/core';

export type ModalSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (open()) {
      <div class="backdrop" (click)="onBackdrop()" role="presentation">
        <div class="modal" [attr.data-size]="size()" role="dialog" aria-modal="true"
             [attr.aria-labelledby]="title() ? 'modal-title' : null"
             (click)="$event.stopPropagation()">

          <header class="modal__head">
            <h2 id="modal-title">{{ title() }}</h2>
            @if (subtitle()) { <small class="muted">{{ subtitle() }}</small> }
            <button class="close" (click)="close.emit()" aria-label="Cerrar">
              <span class="material-icons">close</span>
            </button>
          </header>

          <div class="modal__body">
            <ng-content />
          </div>

          @if (hasFooter) {
            <footer class="modal__foot">
              <ng-content select="[slot=footer]" />
            </footer>
          }
        </div>
      </div>
    }
  `,
  styles: [`
    :host { display: contents; }

    .backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.55);
      backdrop-filter: blur(3px);
      -webkit-backdrop-filter: blur(3px);
      z-index: var(--z-modal);
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 0;
      animation: fade var(--t-fast) ease-out;
    }

    .modal {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      width: 100%;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slide-up var(--t-base) cubic-bezier(0.16, 1, 0.3, 1);
      max-height: 100dvh;
    }

    .modal__head {
      position: sticky; top: 0; z-index: 1;
      background: var(--bg-surface);
      padding: var(--s-4) var(--s-5);
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: 1fr auto;
      grid-template-areas:
        'title close'
        'sub   sub';
      align-items: center;
      gap: 2px var(--s-3);
    }
    .modal__head h2 {
      grid-area: title;
      font-size: 16px;
      font-weight: 700;
      color: var(--text);
    }
    .modal__head .muted {
      grid-area: sub;
      color: var(--text-muted);
      font-size: 12px;
    }
    .close {
      grid-area: close;
      width: 36px; height: 36px;
      border: 0;
      background: var(--bg-hover);
      color: var(--text-muted);
      border-radius: var(--r-full);
      cursor: pointer;
      display: grid; place-items: center;
      transition: background var(--t-fast), color var(--t-fast);
    }
    .close:hover { background: var(--danger-soft); color: var(--danger); }
    .close .material-icons { font-size: 18px; }

    .modal__body {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
      padding: var(--s-5);
      -webkit-overflow-scrolling: touch;
      overscroll-behavior: contain;
    }

    .modal__foot {
      position: sticky; bottom: 0;
      background: var(--bg-surface);
      padding: var(--s-3) var(--s-5);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: flex-end;
      gap: var(--s-2);
      flex-wrap: wrap;
    }

    /* ===== Mobile: full screen ===== */
    @media (max-width: 599px) {
      .modal {
        width: 100%;
        height: 100dvh;
        max-height: 100dvh;
        border-radius: 0;
        border: 0;
      }
    }

    /* ===== Tablet+: centered card ===== */
    @media (min-width: 600px) {
      .backdrop {
        align-items: center;
        padding: var(--s-5);
      }
      .modal {
        border-radius: var(--r-xl);
        max-height: calc(100dvh - 40px);
        box-shadow: var(--shadow-lg);
        height: auto;
      }
      [data-size='sm'] { max-width: 420px; }
      [data-size='md'] { max-width: 640px; }
      [data-size='lg'] { max-width: 880px; }
    }

    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slide-up {
      from { transform: translateY(40px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }
  `],
})
export class ModalComponent implements OnDestroy {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly size = input<ModalSize>('md');
  readonly closeOnBackdrop = input<boolean>(true);
  readonly closeOnEsc = input<boolean>(true);

  @Output() close = new EventEmitter<void>();

  hasFooter = true;
  /** Contador global: cuántos modales hay abiertos simultáneamente. */
  private static openCount = 0;
  /** Indica si esta instancia tenía el lock activo. */
  private hasLock = false;

  constructor() {
    effect(() => {
      if (this.open()) this.lockScroll();
      else this.unlockScroll();
    });
  }

  ngOnDestroy(): void { this.unlockScroll(); }

  @HostListener('document:keydown.escape')
  onEsc() {
    if (this.open() && this.closeOnEsc()) this.close.emit();
  }

  onBackdrop() {
    if (this.closeOnBackdrop()) this.close.emit();
  }

  private lockScroll() {
    if (typeof document === 'undefined' || this.hasLock) return;
    this.hasLock = true;
    ModalComponent.openCount++;
    document.body.style.overflow = 'hidden';
  }

  private unlockScroll() {
    if (typeof document === 'undefined' || !this.hasLock) return;
    this.hasLock = false;
    ModalComponent.openCount = Math.max(0, ModalComponent.openCount - 1);
    // Solo desbloquea cuando NINGÚN modal queda abierto.
    if (ModalComponent.openCount === 0) {
      document.body.style.overflow = '';
    }
  }
}
