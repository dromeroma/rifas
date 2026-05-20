import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

export type KpiTone = 'default' | 'accent' | 'info' | 'warning' | 'danger';

@Component({
  selector: 'app-kpi',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="kpi" [attr.data-tone]="tone()">
      <div class="kpi__head">
        @if (icon()) { <span class="material-icons kpi__icon">{{ icon() }}</span> }
        <small class="kpi__label">{{ label() }}</small>
      </div>
      <strong class="kpi__value tabular">{{ value() }}</strong>
      @if (hint()) { <span class="kpi__hint">{{ hint() }}</span> }
    </div>
  `,
  styles: [`
    :host { display: block; }
    .kpi {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4) var(--s-5);
      display: grid;
      gap: 4px;
      min-height: 92px;
      transition: border-color var(--t-fast), transform var(--t-fast);
    }
    .kpi:hover { border-color: var(--border-strong); }
    .kpi__head {
      display: flex;
      align-items: center;
      gap: var(--s-2);
    }
    .kpi__icon {
      width: 26px; height: 26px;
      border-radius: var(--r-sm);
      display: grid; place-items: center;
      background: var(--bg-hover);
      color: var(--text-muted);
      font-size: 16px;
    }
    .kpi__label {
      color: var(--text-muted);
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      font-weight: 600;
    }
    .kpi__value {
      font-size: 26px;
      font-weight: 700;
      color: var(--text);
      line-height: 1.1;
    }
    .kpi__hint { color: var(--text-faint); font-size: 12px; }

    [data-tone='accent'] .kpi__icon { background: var(--accent-soft); color: var(--accent); }
    [data-tone='accent'] .kpi__value { color: var(--accent); }
    [data-tone='info']   .kpi__icon { background: var(--info-soft); color: var(--info); }
    [data-tone='info']   .kpi__value { color: var(--info); }
    [data-tone='warning'] .kpi__icon { background: var(--warning-soft); color: var(--warning); }
    [data-tone='warning'] .kpi__value { color: var(--warning); }
    [data-tone='danger']  .kpi__icon { background: var(--danger-soft); color: var(--danger); }
    [data-tone='danger']  .kpi__value { color: var(--danger); }
  `],
})
export class KpiComponent {
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly hint = input<string>('');
  readonly icon = input<string | null>(null);
  readonly tone = input<KpiTone>('default');
}
