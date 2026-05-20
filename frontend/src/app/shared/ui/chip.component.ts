import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

export type ChipTone =
  | 'default' | 'accent' | 'info' | 'warning' | 'danger'
  | 'available' | 'reserved' | 'pending_payment' | 'paid' | 'expired' | 'winning';

@Component({
  selector: 'app-chip',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="chip" [attr.data-tone]="tone()">
      @if (dot()) { <span class="chip__dot"></span> }
      <ng-content />
    </span>
  `,
  styles: [`
    :host { display: inline-block; }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: var(--r-full);
      font-size: 11px;
      font-weight: 600;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: var(--bg-hover);
      color: var(--text-muted);
      white-space: nowrap;
    }
    .chip__dot {
      width: 6px; height: 6px;
      border-radius: 50%;
      background: currentColor;
    }
    [data-tone='accent'], [data-tone='paid'], [data-tone='winning'] {
      background: var(--accent-soft); color: var(--accent);
    }
    [data-tone='winning'] { background: rgba(251, 191, 36, 0.18); color: #f59e0b; }
    [data-tone='info']    { background: var(--info-soft); color: var(--info); }
    [data-tone='warning'], [data-tone='reserved'], [data-tone='pending_payment'] {
      background: var(--warning-soft); color: var(--warning);
    }
    [data-tone='danger'], [data-tone='expired'] {
      background: var(--danger-soft); color: var(--danger);
    }
    [data-tone='available'] {
      background: var(--bg-hover); color: var(--text-muted);
    }
  `],
})
export class ChipComponent {
  readonly tone = input<ChipTone>('default');
  readonly dot = input<boolean>(true);
}
