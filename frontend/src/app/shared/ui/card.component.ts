import { CommonModule } from '@angular/common';
import { Component, input } from '@angular/core';

@Component({
  selector: 'app-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <section class="card" [class.card--elevated]="elevated()" [class.card--inset]="inset()">
      @if (title() || subtitle() || actions) {
        <header class="card__head">
          <div class="card__titles">
            @if (title()) { <h3>{{ title() }}</h3> }
            @if (subtitle()) { <small class="card__sub">{{ subtitle() }}</small> }
          </div>
          <div class="card__actions">
            <ng-content select="[slot=actions]" />
          </div>
        </header>
      }
      <div class="card__body">
        <ng-content />
      </div>
    </section>
  `,
  styles: [`
    :host { display: block; }
    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-5);
      transition: border-color var(--t-fast);
    }
    .card--elevated { box-shadow: var(--shadow-md); }
    .card--inset { background: var(--bg-base); }

    .card__head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: var(--s-3);
      margin-bottom: var(--s-4);
    }
    .card__titles { display: grid; gap: 2px; }
    .card__sub { color: var(--text-muted); font-size: 12px; }
    .card__actions { display: flex; gap: var(--s-2); }
    .card__body { display: contents; }

    @media (max-width: 600px) {
      .card { padding: var(--s-4); border-radius: var(--r-md); }
    }
  `],
})
export class CardComponent {
  readonly title = input<string>('');
  readonly subtitle = input<string>('');
  readonly elevated = input<boolean>(false);
  readonly inset = input<boolean>(false);
  actions: unknown; // marker — slot is consumed via ng-content
}
