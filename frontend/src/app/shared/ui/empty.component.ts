import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-empty',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="empty">
      <div class="empty__icon">
        <span class="material-icons">{{ icon() }}</span>
      </div>
      <strong class="empty__title">{{ title() }}</strong>
      @if (description()) { <p class="empty__desc">{{ description() }}</p> }
      <ng-content />
    </div>
  `,
  styles: [`
    :host { display: block; }
    .empty {
      display: grid;
      place-items: center;
      gap: var(--s-3);
      padding: var(--s-7) var(--s-4);
      text-align: center;
      color: var(--text-muted);
    }
    .empty__icon {
      width: 56px; height: 56px;
      border-radius: 50%;
      background: var(--bg-hover);
      display: grid; place-items: center;
      color: var(--text-faint);
    }
    .empty__icon .material-icons { font-size: 28px; }
    .empty__title { color: var(--text); font-size: 15px; font-weight: 600; }
    .empty__desc { color: var(--text-muted); font-size: 13px; max-width: 360px; }
  `],
})
export class EmptyComponent {
  readonly icon = input<string>('inbox');
  readonly title = input.required<string>();
  readonly description = input<string>('');
}
