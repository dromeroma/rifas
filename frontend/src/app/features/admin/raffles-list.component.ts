import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { Raffle } from '@core/models/raffle.model';
import { AuthService } from '@core/services/auth.service';
import { RaffleService } from '@core/services/raffle.service';
import { ButtonComponent, ChipComponent, EmptyComponent } from '@shared/ui';
import { RaffleCreateModalComponent } from './raffle-create-modal.component';

@Component({
  selector: 'app-raffles-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, ButtonComponent, ChipComponent, EmptyComponent,
    RaffleCreateModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Rifas</h1>
          <p class="muted">{{ raffles().length }} rifa(s) creada(s).</p>
        </div>
        @if (canCreate()) {
          <div class="head__cta">
            <app-button variant="primary" icon="add"
                        [disabled]="quotaReached()"
                        [title]="quotaReached() ? quotaMessage() : 'Crear una rifa nueva'"
                        (click)="openCreate()">
              Nueva rifa
            </app-button>
            @if (quotaReached()) {
              <small class="quota-hint">
                <span class="material-icons">info</span>
                {{ quotaMessage() }}
              </small>
            }
          </div>
        }
      </header>

      @if (loading()) {
        <div class="grid">
          @for (i of [1,2,3]; track i) { <div class="sk"></div> }
        </div>
      } @else if (!raffles().length) {
        <app-empty icon="casino" title="No hay rifas creadas"
                    description="Crea la primera rifa con el botón Nueva rifa." />
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
              @if (r.lottery_name) {
                <p class="muted small">🎰 {{ r.lottery_name }}</p>
              }
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

    <app-raffle-create-modal
      [open]="createOpen()"
      (close)="createOpen.set(false)"
      (created)="onCreated($event)"
    />
  `,
  styles: [`
    .page { display: grid; gap: var(--s-5); }
    .page__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: var(--s-3); flex-wrap: wrap;
    }
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
    .card .small { font-size: 12px; }
    .card__foot {
      display: flex; justify-content: space-between; align-items: center;
      margin-top: var(--s-2); padding-top: var(--s-3);
      border-top: 1px solid var(--border);
    }
    .ok { color: var(--accent); font-size: 18px; }
    .warn { color: var(--warning); font-size: 18px; }
    .head__cta { display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
    .quota-hint {
      display: inline-flex; align-items: center; gap: 4px;
      color: var(--warning); font-size: 11px; max-width: 280px; text-align: right;
    }
    .quota-hint .material-icons { font-size: 14px; }
  `],
})
export class RafflesListComponent implements OnInit {
  private readonly raffleSvc = inject(RaffleService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  raffles = signal<Raffle[]>([]);
  loading = signal(true);
  createOpen = signal(false);

  /** super_admin (sin tenant) y admin de tenant pueden crear rifas. */
  canCreate = computed(() => {
    const role = this.auth.role();
    return role === 'super_admin' || role === 'admin';
  });

  /** True si el tenant del usuario alcanzó su cupo de rifas. */
  quotaReached = computed(() => {
    const t = this.auth.user()?.tenant;
    if (!t) return false; // super_admin sin tenant: no aplica cupo
    return t.max_raffles > 0 && this.raffles().length >= t.max_raffles;
  });

  quotaMessage = computed(() => {
    const t = this.auth.user()?.tenant;
    if (!t) return '';
    return `Cupo alcanzado: ${this.raffles().length}/${t.max_raffles} rifas. Contacta a Boletera para ampliarlo.`;
  });

  ngOnInit(): void {
    this.refresh();
  }

  refresh() {
    this.loading.set(true);
    this.raffleSvc.list().subscribe({
      next: (r) => { this.raffles.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate() { this.createOpen.set(true); }

  onCreated(raffle: Raffle) {
    this.createOpen.set(false);
    this.refresh();
    // Llevar directo al detalle para que pueda generar números
    this.router.navigate(['/admin/raffles', raffle.id]);
  }
}
