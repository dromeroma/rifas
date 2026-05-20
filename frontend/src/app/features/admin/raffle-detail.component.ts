import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';

import { Raffle, Ticket, TicketStatus } from '@core/models/raffle.model';
import { RaffleStats } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { ConfirmService } from '@core/services/confirm.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';
import { CountdownComponent } from '@shared/components/countdown/countdown.component';
import {
  ButtonComponent, CardComponent, ChipComponent, InputComponent,
  KpiComponent, ModalComponent,
} from '@shared/ui';
import { TicketActionsModalComponent } from '../seller/ticket-actions-modal.component';

@Component({
  selector: 'app-raffle-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule, CountdownComponent,
    ButtonComponent, CardComponent, ChipComponent, InputComponent,
    KpiComponent, ModalComponent,
    TicketActionsModalComponent,
  ],
  template: `
    @if (raffle(); as r) {
      <div class="page">
        <header class="page__head">
          <div>
            <h1>{{ r.name }}</h1>
            <p class="muted">{{ '$' + fmt(r.ticket_price) }} por boleta · comisión {{ '$' + fmt(r.seller_commission) }} · {{ r.total_tickets }} boletas</p>
            @if (r.lottery_name) {
              <p class="muted">🎰 Juega con: <strong>{{ r.lottery_name }}</strong></p>
            }
          </div>
          <div class="page__actions">
            <app-button variant="secondary" icon="edit" (click)="openEditModal(r)">Editar</app-button>
            @if (!r.numbers_generated) {
              <app-button variant="primary" icon="bolt" (click)="generate(r.id)" [loading]="generating()">
                {{ generating() ? 'Generando 10.000...' : 'Generar números' }}
              </app-button>
            }
          </div>
        </header>

        @if (stats(); as st) {
          <section class="hero">
            @if (st.next_draw) {
              <app-countdown
                [seconds]="st.next_draw.seconds_remaining"
                [label]="'Próximo sorteo · ' + st.next_draw.prize_name + ' · ' + st.next_draw.draw_date"
              />
            }
            @if (st.can_run_draw) {
              <app-chip tone="paid">✓ Listo para sortear</app-chip>
            } @else {
              <div class="threshold">
                <strong>Faltan {{ st.min_threshold - st.sold }}</strong>
                <small class="muted">{{ st.sold }} / {{ st.min_threshold }} pagadas</small>
              </div>
            }
          </section>

          <section class="kpis">
            <app-kpi label="Pagadas"     [value]="st.sold"      icon="check_circle" tone="accent" />
            <app-kpi label="Reservadas"  [value]="st.reserved"  icon="schedule"     tone="warning" />
            <app-kpi label="Disponibles" [value]="st.available" icon="inventory_2"  tone="info" />
          </section>
        }

        @if (selectedTicket()) {
          <app-ticket-actions-modal
            [open]="modalOpen()"
            [ticket]="selectedTicket()"
            [raffle]="r"
            (close)="closeModal()"
            (changed)="onTicketChanged($event)"
          />
        }

        <app-card title="Boletas" [subtitle]="filteredTickets().length + ' resultados'">
          <div slot="actions">
            <select class="select" [(ngModel)]="filter">
              <option value="">Todos</option>
              <option value="available">Disponibles</option>
              <option value="reserved">Reservadas</option>
              <option value="pending_payment">Pendiente pago</option>
              <option value="paid">Pagadas</option>
              <option value="winning">Ganadoras</option>
            </select>
            <input class="input" placeholder="Buscar..." [(ngModel)]="query" />
          </div>

          <!-- Leyenda de colores -->
          <div class="legend">
            <span class="legend__item"><span class="dot dot--available"></span>Disponible</span>
            <span class="legend__item"><span class="dot dot--reserved"></span>Reservada</span>
            <span class="legend__item"><span class="dot dot--pending_payment"></span>Pendiente pago</span>
            <span class="legend__item"><span class="dot dot--paid"></span>Pagada</span>
            <span class="legend__item"><span class="dot dot--winning"></span>Ganadora</span>
            <span class="legend__item"><span class="dot dot--expired"></span>Expirada</span>
          </div>

          <div class="ticket-grid">
            @for (t of filteredTickets(); track t.id) {
              <button class="t-btn t-btn--{{ t.status }}" (click)="preview(t.id)" [title]="t.status">
                {{ t.number_label }}
              </button>
            }
          </div>
        </app-card>
      </div>

      <!-- ============ EDITAR RIFA ============ -->
      <app-modal
        [open]="editOpen()"
        title="Editar rifa"
        subtitle="Estos datos se muestran en el QR público y en la imagen compartible."
        size="lg"
        (close)="closeEditModal()"
      >
        <form class="edit-form">
          <app-input label="Nombre de la rifa" [(ngModel)]="edit.name" name="name" icon="title" />
          <app-input label="Lotería con la que juega" [(ngModel)]="edit.lottery_name" name="lottery_name" icon="casino"
                      hint="Ej: Lotería de Bogotá, Lotería del Cauca, etc." />
          <div class="form-row">
            <app-input label="Responsable" [(ngModel)]="edit.responsible_name" name="responsible_name" icon="person" />
            <app-input label="Teléfono de contacto" [(ngModel)]="edit.responsible_phone" name="responsible_phone" icon="phone" inputmode="tel" />
          </div>
          <app-input label="Email de contacto" type="email" [(ngModel)]="edit.responsible_email" name="responsible_email" icon="alternate_email" />
          <app-input label="Color primario (HEX)" [(ngModel)]="edit.primary_color" name="primary_color" icon="palette"
                      hint="Ej: #1e8e54 (verde). Se usa en la cancha de la boleta." />
          <label class="textarea-field">
            <span>Términos y condiciones (opcional)</span>
            <textarea rows="3" [(ngModel)]="edit.terms" name="terms"
                      placeholder="Reglas, restricciones, política de cancelación..."></textarea>
          </label>
        </form>
        <ng-container slot="footer">
          <app-button variant="secondary" (click)="closeEditModal()">Cancelar</app-button>
          <app-button variant="primary" icon="check" [loading]="savingEdit()" (click)="saveEdit()">
            {{ savingEdit() ? 'Guardando...' : 'Guardar cambios' }}
          </app-button>
        </ng-container>
      </app-modal>
    }
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; }
    .page__head h1 { font-size: 22px; }
    .page__actions { display: flex; gap: var(--s-2); flex-wrap: wrap; }

    /* Edit modal form */
    .edit-form { display: grid; gap: var(--s-3); }
    .form-row { display: grid; gap: var(--s-3); grid-template-columns: 1fr; }
    @media (min-width: 540px) { .form-row { grid-template-columns: 1fr 1fr; } }
    .textarea-field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .textarea-field span { font-weight: 500; }
    .textarea-field textarea {
      padding: 10px 12px;
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid transparent;
      border-radius: var(--r-md);
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
    }
    .textarea-field textarea:focus { outline: 0; border-color: var(--accent); }
    .muted { color: var(--text-muted); font-size: 13px; margin-top: 2px; }

    .hero {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-xl);
      padding: var(--s-5);
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: var(--s-4);
    }
    .threshold { display: grid; gap: 2px; text-align: right; }
    .threshold strong { font-size: 18px; color: var(--warning); }

    .kpis {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--s-3);
    }
    @media (max-width: 600px) { .kpis { grid-template-columns: 1fr; } }

    .preview { display: grid; gap: var(--s-3); justify-items: start; }
    .preview__actions { display: flex; gap: 8px; }

    .select, .input {
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      padding: 8px 10px;
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .select:focus, .input:focus { outline: 0; border-color: var(--accent); }

    /* ============ Leyenda ============ */
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
      width: 12px; height: 12px;
      border-radius: 4px;
      border: 1px solid currentColor;
      flex-shrink: 0;
    }
    .dot--available       { background: var(--bg-base); color: var(--text-faint); }
    .dot--reserved        { background: var(--warning); color: var(--warning); border-color: var(--warning); }
    .dot--pending_payment { background: repeating-linear-gradient(45deg, var(--warning) 0 4px, var(--bg-base) 4px 8px); color: var(--warning); border-color: var(--warning); }
    .dot--paid            { background: var(--accent);  color: var(--accent);  border-color: var(--accent); }
    .dot--winning         { background: #f5b400; color: #f5b400; border-color: #f5b400; }
    .dot--expired         { background: var(--danger);  color: var(--danger);  border-color: var(--danger); opacity: 0.5; }

    /* ============ Grilla de boletas ============ */
    .ticket-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(58px, 1fr));
      gap: 6px;
    }
    .t-btn {
      position: relative;
      padding: 10px 0;
      border-radius: var(--r-sm);
      border: 1.5px solid var(--border);
      background: var(--bg-base);
      color: var(--text);
      font-weight: 700;
      cursor: pointer;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
      transition: transform var(--t-fast), border-color var(--t-fast), box-shadow var(--t-fast);
    }
    .t-btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 10px rgba(0,0,0,0.25);
    }
    .t-btn:active { transform: translateY(0); }

    /* Disponible: visible pero neutro */
    .t-btn--available {
      background: var(--bg-base);
      color: var(--text);
      border-color: var(--border);
    }
    .t-btn--available:hover { border-color: var(--accent); color: var(--accent); }

    /* Reservada: amarillo sólido */
    .t-btn--reserved {
      background: var(--warning);
      color: #1f1500;
      border-color: var(--warning);
    }

    /* Pendiente pago: amarillo rayado (claramente distinto de reservada) */
    .t-btn--pending_payment {
      background:
        repeating-linear-gradient(
          45deg,
          var(--warning) 0 6px,
          color-mix(in srgb, var(--warning) 60%, transparent) 6px 12px
        );
      color: #1f1500;
      border-color: var(--warning);
    }

    /* Pagada: verde sólido (es el éxito) */
    .t-btn--paid {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: var(--accent);
    }

    /* Ganadora: dorado */
    .t-btn--winning {
      background: #f5b400;
      color: #1f1500;
      border-color: #f5b400;
      box-shadow: 0 0 0 2px rgba(245, 180, 0, 0.25);
    }
    .t-btn--winning::after {
      content: '★';
      position: absolute;
      top: 2px; right: 4px;
      font-size: 9px;
      color: #1f1500;
    }

    /* Expirada: opaca con tachado */
    .t-btn--expired {
      opacity: 0.4;
      text-decoration: line-through;
      color: var(--danger);
      border-color: var(--danger);
    }
  `],
})
export class RaffleDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly raffleSvc = inject(RaffleService);
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  private readonly confirmSvc = inject(ConfirmService);

  raffle = signal<Raffle | null>(null);
  tickets = signal<Ticket[]>([]);
  stats = signal<RaffleStats | null>(null);
  selectedTicket = signal<Ticket | null>(null);
  modalOpen = signal(false);
  generating = signal(false);

  // Editar rifa
  editOpen = signal(false);
  savingEdit = signal(false);
  edit: {
    name: string;
    lottery_name: string;
    responsible_name: string;
    responsible_phone: string;
    responsible_email: string;
    primary_color: string;
    terms: string;
  } = {
    name: '', lottery_name: '', responsible_name: '',
    responsible_phone: '', responsible_email: '',
    primary_color: '', terms: '',
  };

  filter = '';
  query = '';

  readonly filteredTickets = computed(() => {
    const f = this.filter as TicketStatus | '';
    const q = this.query.trim().toLowerCase();
    return this.tickets().filter((t) => {
      if (f && t.status !== f) return false;
      if (q && !t.number_label.includes(q) && !t.code.toLowerCase().includes(q)) return false;
      return true;
    });
  });

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));
    this.load(id);
  }

  private load(id: number) {
    this.raffleSvc.get(id).subscribe((r) => {
      this.raffle.set(r);
      if (r.numbers_generated) this.admin.stats(id).subscribe((s) => this.stats.set(s));
    });
    this.raffleSvc.tickets(id).subscribe((t) => this.tickets.set(t as Ticket[]));
  }

  generate(id: number) {
    this.confirmSvc.ask({
      title: 'Generar números',
      message: 'Esta acción crea las 500 boletas con 20 números cada una y es IRREVERSIBLE. ¿Continuar?',
      tone: 'warning',
      icon: 'bolt',
      confirmLabel: 'Sí, generar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.generating.set(true);
      this.raffleSvc.generateNumbers(id).subscribe({
        next: () => {
          this.load(id);
          this.generating.set(false);
          this.toast.success('Números generados', '10.000 números fueron distribuidos en 500 boletas sin repetir.');
        },
        error: (e) => {
          this.generating.set(false);
          this.toast.error('No se pudieron generar', e?.error?.detail ?? 'Intenta nuevamente.');
        },
      });
    });
  }

  preview(ticketId: number) {
    this.raffleSvc.ticket(ticketId).subscribe((t) => {
      this.selectedTicket.set(t);
      this.modalOpen.set(true);
    });
  }

  closeModal() { this.modalOpen.set(false); }

  onTicketChanged(updated: Ticket) {
    this.tickets.update((arr) => arr.map((t) => (t.id === updated.id ? { ...t, ...updated } : t)));
    this.selectedTicket.set(updated);
    // Refrescar stats
    const r = this.raffle();
    if (r) this.admin.stats(r.id).subscribe((s) => this.stats.set(s));
  }

  openEditModal(r: Raffle) {
    this.edit = {
      name: r.name,
      lottery_name: r.lottery_name ?? '',
      responsible_name: r.responsible_name ?? '',
      responsible_phone: r.responsible_phone ?? '',
      responsible_email: r.responsible_email ?? '',
      primary_color: r.primary_color ?? '',
      terms: r.terms ?? '',
    };
    this.editOpen.set(true);
  }
  closeEditModal() { this.editOpen.set(false); }

  saveEdit() {
    const id = this.raffle()?.id;
    if (!id) return;
    this.savingEdit.set(true);
    const payload = {
      name: this.edit.name || undefined,
      lottery_name: this.edit.lottery_name || null,
      responsible_name: this.edit.responsible_name || null,
      responsible_phone: this.edit.responsible_phone || null,
      responsible_email: this.edit.responsible_email || null,
      primary_color: this.edit.primary_color || null,
      terms: this.edit.terms || null,
    };
    this.raffleSvc.update(id, payload).subscribe({
      next: (updated) => {
        this.raffle.set(updated);
        this.savingEdit.set(false);
        this.editOpen.set(false);
        this.toast.success('Rifa actualizada', 'Los cambios se aplicaron correctamente.');
      },
      error: (e) => {
        this.savingEdit.set(false);
        this.toast.error('No se pudo guardar', e?.error?.detail ?? 'Intenta de nuevo.');
      },
    });
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }
}
