import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { Raffle, SellerTierStatus, Ticket } from '@core/models/raffle.model';
import { SellerAssignment } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';
import { RaffleService } from '@core/services/raffle.service';
import {
  CardComponent, EmptyComponent, KpiComponent,
} from '@shared/ui';
import { PackageSaleModalComponent } from './package-sale-modal.component';
import { TicketActionsModalComponent } from './ticket-actions-modal.component';

@Component({
  selector: 'app-my-sales',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    CardComponent, EmptyComponent, KpiComponent,
    TicketActionsModalComponent, PackageSaleModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Mis ventas</h1>
          <p class="muted">Boletas asignadas a ti para reservar y vender.</p>
        </div>
      </header>

      @if (loadError()) {
        <div class="alert">
          <span class="material-icons">error_outline</span>
          {{ loadError() }}
        </div>
      }

      @if (loading()) {
        <p class="muted">Cargando tus boletas...</p>
      } @else if (!assignments().length) {
        <app-empty
          icon="assignment_late"
          title="No tienes boletas asignadas"
          description="Pídele al administrador que te asigne un bloque de boletas para empezar a vender."
        />
      } @else {

        <!-- Selector de rifa cuando hay varias -->
        @if (rafflesWithMyTickets().length > 1) {
          <div class="raffle-chips">
            @for (r of rafflesWithMyTickets(); track r.id; let i = $index) {
              <button class="r-chip"
                      [class.r-chip--active]="r.id === selectedRaffleId()"
                      (click)="selectRaffle(r.id)">
                {{ r.name }}
              </button>
            }
          </div>
        }

        @if (selectedRaffle(); as r) {

          <!-- Modo PREMIUM: panel de venta por paquetes -->
          @if (r.mode === 'package') {
            <section class="pkg-panel">
              <header class="pkg-panel__head">
                <div>
                  <small class="pkg-panel__label">RIFA PREMIUM</small>
                  <h2>Vende paquetes de números</h2>
                  <p class="muted">
                    Esta rifa se vende en paquetes. Elige el tamaño, busca o crea
                    el cliente, y el sistema asigna los números aleatoriamente.
                  </p>
                </div>
                <button class="pkg-panel__cta" type="button" (click)="openPackageModal()">
                  <span class="material-icons">add_shopping_cart</span>
                  Vender un paquete
                </button>
              </header>
              <div class="pkg-options">
                @for (p of r.package_options ?? []; track p.size) {
                  <button type="button" class="pkg-opt" (click)="openPackageModal()">
                    <strong>{{ p.size }}</strong>
                    <small class="muted">números</small>
                    <div class="pkg-opt__price">{{ '$' + fmt(p.price) }}</div>
                  </button>
                }
              </div>
            </section>
          }

          <!-- KPIs -->
          <section class="kpis">
            <app-kpi label="Asignadas"   [value]="kpis().total"     icon="confirmation_number" />
            <app-kpi label="Reservadas"  [value]="kpis().reserved"  icon="schedule"     tone="warning" />
            <app-kpi label="Pagadas"     [value]="kpis().paid"      icon="check_circle" tone="accent" />
            <app-kpi label="Disponibles" [value]="kpis().available" icon="inventory_2"  tone="info" />
            <app-kpi label="Comisión" [value]="'$' + fmt(kpis().commission)" icon="payments" tone="accent" hint="Sobre boletas ya pagadas" />
          </section>

          <!-- Estado del tier de comisión escalonada -->
          @if (tierStatus(); as ts) {
            @if (ts.uses_tiers) {
              <div class="tier-card">
                <div class="tier-card__head">
                  <span class="material-icons">military_tech</span>
                  <div>
                    <strong>
                      @if (ts.current_tier) {
                        Tramo actual: {{ '$' + fmt(ts.current_amount_per_ticket) }} por boleta
                      } @else {
                        Aún no estás en ningún tramo
                      }
                    </strong>
                    <small class="muted">
                      Llevas {{ ts.paid_count }} boleta(s) pagada(s) ·
                      Comisión acumulada: <strong>{{ '$' + fmt(ts.earned_total) }}</strong>
                    </small>
                  </div>
                </div>

                @if (ts.next_tier && ts.tickets_to_next_tier != null && ts.tickets_to_next_tier > 0) {
                  <div class="tier-card__next">
                    <span class="material-icons">trending_up</span>
                    <span>
                      Te faltan <strong>{{ ts.tickets_to_next_tier }}</strong> boleta(s) para subir a
                      <strong>{{ '$' + fmt(ts.next_tier.amount_per_ticket) }}</strong> por boleta.
                      ¡Al cruzar el tramo, ese valor se aplica a <em>todas</em> tus boletas!
                    </span>
                  </div>
                }

                <div class="tier-card__ladder">
                  @for (t of r.commission_tiers ?? []; track t.from_count) {
                    <div class="ladder-step"
                          [class.ladder-step--active]="ts.current_tier?.from_count === t.from_count"
                          [class.ladder-step--done]="ts.paid_count > (t.to_count ?? 0) && t.to_count != null">
                      <small>
                        @if (t.to_count != null) {
                          {{ t.from_count }}–{{ t.to_count }}
                        } @else {
                          {{ t.from_count }}+
                        }
                      </small>
                      <strong>{{ '$' + fmt(t.amount_per_ticket) }}</strong>
                    </div>
                  }
                </div>
              </div>
            }
          }

          <app-card title="Mis boletas" [subtitle]="filteredTickets().length + ' resultado(s)'">
            <div slot="actions">
              <select class="select" [(ngModel)]="filter">
                <option value="">Todos</option>
                <option value="available">Disponibles</option>
                <option value="reserved">Reservadas</option>
                <option value="pending_payment">Pendiente pago</option>
                <option value="paid">Pagadas</option>
              </select>
            </div>

            <!-- Leyenda -->
            <div class="legend">
              <span class="legend__item"><span class="dot dot--available"></span>Disponible</span>
              <span class="legend__item"><span class="dot dot--reserved"></span>Reservada</span>
              <span class="legend__item"><span class="dot dot--pending_payment"></span>Pendiente pago</span>
              <span class="legend__item"><span class="dot dot--paid"></span>Pagada</span>
            </div>

            <div class="ticket-grid">
              @for (t of filteredTickets(); track t.id) {
                <button
                  class="t-btn t-btn--{{ t.status }}"
                  (click)="onTicketClick(t)"
                  [title]="t.status"
                >
                  {{ t.number_label }}
                </button>
              }
            </div>
          </app-card>

          @if (selectedTicket()) {
            <app-ticket-actions-modal
              [open]="modalOpen()"
              [ticket]="selectedTicket()"
              [raffle]="r"
              (close)="closeModal()"
              (changed)="onTicketChanged($event)"
            />
          }

          <!-- Modal de venta de paquete (modo Premium) -->
          <app-package-sale-modal
            [open]="packageModalOpen()"
            [raffle]="r"
            (close)="closePackageModal()"
            (sold)="onPackageSold()"
          />
        }
      }
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head h1 { font-size: 22px; }
    .muted { color: var(--text-muted); font-size: 13px; }

    .raffle-chips { display: flex; gap: 6px; overflow-x: auto; }
    .r-chip {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text-muted);
      padding: 8px 14px;
      border-radius: var(--r-full);
      font-weight: 600; font-size: 13px;
      cursor: pointer; white-space: nowrap;
    }
    .r-chip--active { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

    .kpis {
      display: grid; gap: var(--s-3);
      grid-template-columns: repeat(2, 1fr);
    }
    @media (min-width: 720px) { .kpis { grid-template-columns: repeat(5, 1fr); } }

    /* ============ Paquetes (modo Premium) ============ */
    .pkg-panel {
      background: linear-gradient(135deg, var(--accent-soft), var(--bg-surface));
      border: 1px solid var(--accent);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid; gap: var(--s-3);
    }
    .pkg-panel__head {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--s-3); flex-wrap: wrap;
    }
    .pkg-panel__label {
      font-size: 11px; letter-spacing: 0.1em; color: var(--accent);
      font-weight: 800; text-transform: uppercase;
    }
    .pkg-panel h2 { margin: 4px 0; font-size: 20px; letter-spacing: -0.01em; }
    .pkg-panel p { margin: 0; font-size: 13px; }
    .pkg-panel__cta {
      background: var(--accent); color: var(--accent-fg);
      border: 0; padding: 10px 18px;
      border-radius: var(--r-md);
      font-weight: 700; font-size: 14px;
      cursor: pointer;
      display: inline-flex; align-items: center; gap: 6px;
      transition: background 0.15s ease, transform 0.15s ease;
    }
    .pkg-panel__cta:hover { background: var(--accent-hover); transform: translateY(-1px); }
    .pkg-panel__cta .material-icons { font-size: 18px; }

    .pkg-options {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
      gap: var(--s-2);
    }
    .pkg-opt {
      background: var(--bg-base); border: 1.5px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-2);
      display: grid; gap: 2px;
      cursor: pointer; text-align: center;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .pkg-opt:hover { border-color: var(--accent); transform: translateY(-2px); }
    .pkg-opt strong {
      font-size: 22px; color: var(--accent); font-weight: 800;
      font-variant-numeric: tabular-nums;
    }
    .pkg-opt__price { font-weight: 700; font-size: 13px; font-variant-numeric: tabular-nums; }

    .tier-card {
      display: grid;
      gap: var(--s-3);
      background: var(--bg-surface);
      border: 1px solid var(--accent);
      border-radius: var(--r-lg);
      padding: var(--s-4);
    }
    .tier-card__head { display: flex; align-items: center; gap: var(--s-3); }
    .tier-card__head .material-icons { font-size: 32px; color: var(--accent); }
    .tier-card__head strong { display: block; font-size: 15px; color: var(--text); }
    .tier-card__head small { display: block; font-size: 12px; margin-top: 2px; }
    .tier-card__head small strong { display: inline; color: var(--accent); font-size: 12px; }

    .tier-card__next {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .tier-card__next .material-icons { font-size: 20px; }

    .tier-card__ladder {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(90px, 1fr));
      gap: var(--s-2);
    }
    .ladder-step {
      display: grid; gap: 2px;
      padding: var(--s-2);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
    .ladder-step small { color: var(--text-muted); font-size: 11px; }
    .ladder-step strong { color: var(--text); font-size: 13px; }
    .ladder-step--active {
      background: var(--accent); border-color: var(--accent);
    }
    .ladder-step--active small, .ladder-step--active strong { color: var(--accent-fg); }
    .ladder-step--done {
      opacity: 0.55;
    }

    .select {
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      padding: 8px 10px;
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .select:focus { outline: 0; border-color: var(--accent); }

    .legend {
      display: flex; flex-wrap: wrap; gap: var(--s-3);
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      margin-bottom: var(--s-3);
      font-size: 12px;
      color: var(--text-muted);
    }
    .legend__item { display: inline-flex; align-items: center; gap: 6px; }
    .dot {
      width: 12px; height: 12px; border-radius: 4px;
      border: 1px solid currentColor;
    }
    .dot--available       { background: var(--bg-base); color: var(--text-faint); }
    .dot--reserved        { background: var(--warning); color: var(--warning); border-color: var(--warning); }
    .dot--pending_payment { background: repeating-linear-gradient(45deg, var(--warning) 0 4px, var(--bg-base) 4px 8px); color: var(--warning); border-color: var(--warning); }
    .dot--paid            { background: var(--accent); color: var(--accent); border-color: var(--accent); }

    .ticket-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
      gap: 6px;
    }
    .t-btn {
      padding: 10px 0;
      border-radius: var(--r-sm);
      border: 1.5px solid var(--border);
      background: var(--bg-base);
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      transition: transform var(--t-fast), border-color var(--t-fast);
    }
    .t-btn:hover { transform: translateY(-2px); box-shadow: 0 4px 10px rgba(0,0,0,0.25); }
    .t-btn--available { color: var(--text); }
    .t-btn--available:hover { border-color: var(--accent); color: var(--accent); }
    .t-btn--reserved { background: var(--warning); color: #1f1500; border-color: var(--warning); }
    .t-btn--pending_payment {
      background: repeating-linear-gradient(45deg, var(--warning) 0 6px, color-mix(in srgb, var(--warning) 60%, transparent) 6px 12px);
      color: #1f1500; border-color: var(--warning);
    }
    .t-btn--paid { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class MySalesComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly raffleSvc = inject(RaffleService);
  private readonly auth = inject(AuthService);

  loading = signal(true);
  assignments = signal<SellerAssignment[]>([]);
  raffles = signal<Raffle[]>([]);
  allTickets = signal<Ticket[]>([]);
  selectedRaffleId = signal<number | null>(null);
  selectedTicket = signal<Ticket | null>(null);
  modalOpen = signal(false);
  tierStatus = signal<SellerTierStatus | null>(null);
  packageModalOpen = signal(false);

  filter = '';

  readonly rafflesWithMyTickets = computed(() => {
    const raffleIds = new Set(this.assignments().map((a) => a.raffle_id));
    return this.raffles().filter((r) => raffleIds.has(r.id));
  });

  readonly selectedRaffle = computed(() =>
    this.raffles().find((r) => r.id === this.selectedRaffleId()) ?? null,
  );

  readonly myTickets = computed(() => {
    const rId = this.selectedRaffleId();
    if (!rId) return [];

    // Set de labels asignadas a este vendedor para la rifa seleccionada
    const labels = new Set<string>();
    for (const a of this.assignments()) {
      if (a.raffle_id !== rId) continue;
      for (let i = a.from_ticket; i <= a.to_ticket; i++) {
        labels.add(String(i).padStart(3, '0'));
      }
    }
    // allTickets ya viene filtrado por la rifa en el backend; solo filtramos por label
    return this.allTickets().filter((t) => labels.has(t.number_label));
  });

  readonly filteredTickets = computed(() => {
    const f = this.filter;
    return this.myTickets().filter((t) => !f || t.status === f);
  });

  readonly kpis = computed(() => {
    const tix = this.myTickets();
    const total = tix.length;
    const reserved = tix.filter((t) => t.status === 'reserved' || t.status === 'pending_payment').length;
    const paid = tix.filter((t) => t.status === 'paid' || t.status === 'winning').length;
    const available = tix.filter((t) => t.status === 'available').length;
    const ts = this.tierStatus();
    const raffle = this.selectedRaffle();
    const commPerTicket = ts?.uses_tiers
      ? Number(ts.current_amount_per_ticket)
      : (raffle ? Number(raffle.seller_commission) : 0);
    return { total, reserved, paid, available, commission: paid * commPerTicket };
  });

  loadError = signal<string | null>(null);

  ngOnInit(): void { this.refresh(); }

  refresh() {
    this.loading.set(true);
    this.loadError.set(null);
    forkJoin({
      assignments: this.admin.listAssignments(),
      raffles: this.raffleSvc.list(),
    }).subscribe({
      next: ({ assignments, raffles }) => {
        this.assignments.set(assignments);
        this.raffles.set(raffles);

        const raffleIds = [...new Set(assignments.map((a) => a.raffle_id))];
        if (raffleIds.length) {
          this.selectedRaffleId.set(raffleIds[0]);
          this.loadTicketsForCurrentRaffle();
        } else {
          this.loading.set(false);
        }
      },
      error: (e) => {
        const detail = e?.error?.detail ?? e?.message ?? 'No se pudieron cargar las boletas';
        this.loadError.set(`Error: ${detail} (status ${e?.status ?? '?'})`);
        this.loading.set(false);
      },
    });
  }

  private loadTicketsForCurrentRaffle() {
    const r = this.selectedRaffleId();
    if (!r) { this.loading.set(false); return; }
    this.raffleSvc.tickets(r).subscribe({
      next: (tx) => { this.allTickets.set(tx as Ticket[]); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
    this.loadTierStatus(r);
  }

  private loadTierStatus(raffleId: number) {
    this.tierStatus.set(null);
    this.admin.sellerTierStatus(raffleId).subscribe({
      next: (ts) => this.tierStatus.set(ts),
      error: () => this.tierStatus.set(null),
    });
  }

  selectRaffle(id: number) {
    this.selectedRaffleId.set(id);
    this.allTickets.set([]);
    this.loading.set(true);
    this.loadTicketsForCurrentRaffle();
  }

  onTicketClick(t: Ticket) {
    // En CUALQUIER estado abrimos el modal con info + acciones disponibles.
    // El modal decide qué mostrar según el estado.
    this.raffleSvc.ticket(t.id).subscribe((full) => {
      this.selectedTicket.set(full);
      this.modalOpen.set(true);
    });
  }

  closeModal() { this.modalOpen.set(false); }

  openPackageModal() { this.packageModalOpen.set(true); }
  closePackageModal() { this.packageModalOpen.set(false); }
  onPackageSold() {
    // Recarga tickets para reflejar las nuevas reservas
    this.loadTicketsForCurrentRaffle();
  }

  onTicketChanged(updated: Ticket) {
    // Actualizar el ticket en la grilla local sin recargar todo
    this.allTickets.update((arr) =>
      arr.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)),
    );
    this.selectedTicket.set(updated);
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }
}
