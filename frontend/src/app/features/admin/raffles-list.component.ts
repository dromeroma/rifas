import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Raffle } from '@core/models/raffle.model';
import { RaffleService } from '@core/services/raffle.service';
import { ChipComponent, EmptyComponent } from '@shared/ui';

@Component({
  selector: 'app-raffles-list',
  standalone: true,
  imports: [CommonModule, RouterLink, ChipComponent, EmptyComponent],
  template: `
    <div class="page">
      <header class="page__head">
        <h1>Rifas</h1>
      </header>

      @if (loading()) {
        <div class="grid">
          @for (i of [1,2,3]; track i) { <div class="sk"></div> }
        </div>
      } @else if (!raffles().length) {
        <app-empty icon="casino" title="No hay rifas creadas" />
      } @else {
        <div class="grid">
          @for (r of raffles(); track r.id) {
            <a class="card" [routerLink]="['/admin/raffles', r.id]">
              <header class="card__head">
                <app-chip [tone]="r.status === 'active' ? 'accent' : 'default'">{{ r.status }}</app-chip>
                @if (r.numbers_generated) {
                  <span class="material-icons ok" title="Números generados">verified</span>
                } @else {
                  <span class="material-icons warn" title="Sin números">pending</span>
                }
              </header>
              <h2>{{ r.name }}</h2>
              <p class="muted">{{ r.total_tickets }} boletas · {{ r.numbers_per_ticket }} números c/u</p>
              <div class="card__foot">
                <small class="muted">Sorteo final</small>
                <strong>{{ r.final_draw_date }}</strong>
              </div>
            </a>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-5); }
    .page__head h1 { font-size: 24px; }
    .grid { display: grid; gap: var(--s-3); grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
    .sk { background: var(--bg-surface); border: 1px solid var(--border); border-radius: var(--r-lg); height: 160px; opacity: 0.5; animation: pulse 1.5s ease-in-out infinite; }
    @keyframes pulse { 50% { opacity: 0.8; } }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid;
      gap: var(--s-2);
      transition: border-color var(--t-fast), transform var(--t-fast);
      text-decoration: none;
      color: inherit;
    }
    .card:hover { border-color: var(--accent); transform: translateY(-2px); }
    .card__head { display: flex; justify-content: space-between; align-items: center; }
    .card h2 { font-size: 16px; color: var(--text); }
    .card__foot {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: var(--s-2); padding-top: var(--s-3);
      border-top: 1px solid var(--border);
    }
    .ok { color: var(--accent); font-size: 18px; }
    .warn { color: var(--warning); font-size: 18px; }
  `],
})
export class RafflesListComponent implements OnInit {
  private readonly raffleSvc = inject(RaffleService);

  raffles = signal<Raffle[]>([]);
  loading = signal(true);

  ngOnInit(): void {
    this.raffleSvc.list().subscribe({
      next: (r) => { this.raffles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }
}
