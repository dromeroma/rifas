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

          <!-- Acento superior con gradient sutil -->
          <span class="modal__accent" aria-hidden="true"></span>

          <header class="modal__head">
            @if (icon()) {
              <span class="modal__head-icon" aria-hidden="true">
                <span class="material-icons">{{ icon() }}</span>
              </span>
            }
            <div class="modal__head-text">
              <h2 id="modal-title">{{ title() }}</h2>
              @if (subtitle()) { <small class="muted">{{ subtitle() }}</small> }
            </div>
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
      background:
        radial-gradient(circle at 50% 30%, rgba(0,0,0,0.45), rgba(0,0,0,0.72));
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
      z-index: var(--z-modal);
      display: flex;
      align-items: stretch;
      justify-content: center;
      padding: 0;
      animation: fade var(--t-base) ease-out;
    }

    .modal {
      position: relative;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      width: 100%;
      max-width: 100%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      animation: slide-up var(--t-slow) cubic-bezier(0.16, 1, 0.3, 1);
      max-height: 100dvh;
    }

    /* Accent stripe en el top */
    .modal__accent {
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg,
        transparent 0%,
        color-mix(in srgb, var(--accent) 70%, transparent) 20%,
        var(--accent) 50%,
        color-mix(in srgb, var(--accent) 70%, transparent) 80%,
        transparent 100%);
      pointer-events: none;
      z-index: 2;
    }

    .modal__head {
      position: sticky; top: 0; z-index: 1;
      background: linear-gradient(180deg,
        var(--bg-surface) 0%,
        color-mix(in srgb, var(--bg-elevated) 40%, var(--bg-surface)) 100%);
      padding: var(--s-4) var(--s-5);
      border-bottom: 1px solid var(--border);
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--s-3);
    }
    .modal__head-icon {
      width: 40px; height: 40px;
      display: grid; place-items: center;
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: var(--r-md);
      flex-shrink: 0;
    }
    .modal__head-icon .material-icons { font-size: 22px; }
    .modal__head-text { display: grid; gap: 2px; min-width: 0; }
    .modal__head h2 {
      font-size: 17px;
      font-weight: 700;
      color: var(--text);
      letter-spacing: -0.01em;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .modal__head .muted {
      color: var(--text-muted);
      font-size: 12.5px;
      line-height: 1.4;
    }
    .close {
      width: 36px; height: 36px;
      border: 1px solid var(--border);
      background: transparent;
      color: var(--text-muted);
      border-radius: var(--r-full);
      cursor: pointer;
      display: grid; place-items: center;
      transition: all var(--t-fast);
    }
    .close:hover {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: color-mix(in srgb, var(--danger) 40%, transparent);
      transform: rotate(90deg);
    }
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
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--bg-elevated) 30%, var(--bg-surface)) 0%,
        var(--bg-surface) 100%);
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
      .modal__head { padding: var(--s-3) var(--s-4); }
      .modal__head-icon { width: 36px; height: 36px; }
      .modal__head h2 { font-size: 16px; }
      .modal__body { padding: var(--s-4); }
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
        box-shadow:
          0 1px 0 color-mix(in srgb, var(--accent) 20%, transparent) inset,
          0 30px 60px -25px rgba(0, 0, 0, 0.65),
          0 0 0 1px color-mix(in srgb, var(--accent) 8%, transparent);
        height: auto;
      }
      [data-size='sm'] { max-width: 440px; }
      [data-size='md'] { max-width: 660px; }
      [data-size='lg'] { max-width: 900px; }
    }

    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slide-up {
      from { transform: translateY(28px) scale(0.97); opacity: 0; }
      to   { transform: translateY(0)    scale(1);    opacity: 1; }
    }

    @media (prefers-reduced-motion: reduce) {
      .modal { animation: fade var(--t-base) ease-out; }
    }
  `],
})
export class ModalComponent implements OnDestroy {
  readonly open = input<boolean>(false);
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly icon = input<string | null>(null);
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
