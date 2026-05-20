import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

@Component({
  selector: 'app-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type()"
      [disabled]="disabled() || loading()"
      [class]="classes()"
    >
      @if (loading()) {
        <span class="spinner" aria-hidden="true"></span>
      } @else if (icon()) {
        <span class="material-icons icon">{{ icon() }}</span>
      }
      <ng-content />
    </button>
  `,
  styles: [`
    :host { display: inline-block; }
    button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: var(--s-2);
      padding: 0 var(--s-5);
      height: var(--h-button);
      min-width: 88px;
      border: 1px solid transparent;
      border-radius: var(--r-md);
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.01em;
      cursor: pointer;
      transition: background var(--t-fast), border-color var(--t-fast), transform var(--t-fast), opacity var(--t-fast);
      white-space: nowrap;
      user-select: none;
    }
    button:disabled { opacity: 0.55; cursor: not-allowed; }
    button:active:not(:disabled) { transform: translateY(1px); }

    .v-primary {
      background: var(--accent);
      color: var(--accent-fg);
    }
    .v-primary:hover:not(:disabled) { background: var(--accent-hover); }

    .v-secondary {
      background: transparent;
      color: var(--text);
      border-color: var(--border-strong);
    }
    .v-secondary:hover:not(:disabled) { background: var(--bg-hover); }

    .v-ghost {
      background: transparent;
      color: var(--text-muted);
      min-width: 0;
      padding: 0 var(--s-3);
    }
    .v-ghost:hover:not(:disabled) { background: var(--bg-hover); color: var(--text); }

    .v-danger {
      background: var(--danger-soft);
      color: var(--danger);
      border-color: transparent;
    }
    .v-danger:hover:not(:disabled) { background: var(--danger); color: #fff; }

    .s-sm { height: var(--h-button-sm); padding: 0 var(--s-3); font-size: 13px; min-width: 0; }
    .s-lg { height: 52px; padding: 0 var(--s-6); font-size: 15px; }

    .full { width: 100%; }
    .icon { font-size: 18px; }

    .spinner {
      width: 16px;
      height: 16px;
      border: 2px solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  `],
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly disabled = input<boolean>(false);
  readonly loading = input<boolean>(false);
  readonly full = input<boolean>(false);
  readonly icon = input<string | null>(null);

  readonly classes = computed(() =>
    [
      `v-${this.variant()}`,
      `s-${this.size()}`,
      this.full() ? 'full' : '',
    ].filter(Boolean).join(' '),
  );
}
