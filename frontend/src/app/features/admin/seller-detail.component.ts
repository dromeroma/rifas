import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import { SellerUser } from '@core/models/stats.model';
import { AdminService, AssignmentTicketDTO, RaffleAssignmentDetail } from '@core/services/admin.service';
import { ConfirmService } from '@core/services/confirm.service';
import { ToastService } from '@core/services/toast.service';
import {
  AvatarComponent, ButtonComponent, ChipComponent, EmptyComponent, ModalComponent,
} from '@shared/ui';
import { SellerShareLinkComponent } from '@shared/components/seller-share-link/seller-share-link.component';

interface PrintMode {
  raffleId: number;
  mode: 'all' | 'select';
  selected: Set<number>;
}

/**
 * Detalle de un vendedor: muestra por cada rifa donde tiene boletas
 * asignadas, la lista completa, y permite imprimir / agregar / quitar.
 *
 * Ruta: `/admin/sellers/:id`
 */
@Component({
  selector: 'app-seller-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    AvatarComponent, ButtonComponent, ChipComponent, EmptyComponent, ModalComponent,
    SellerShareLinkComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="head">
        <button class="back" (click)="back()" title="Volver">
          <span class="material-icons">arrow_back</span>
        </button>
        @if (seller(); as s) {
          <app-avatar [name]="s.full_name" [size]="56" />
          <div class="info">
            <h1>{{ s.full_name }}</h1>
            <div class="info-meta">
              <small>{{ s.email }}</small>
              @if (s.phone) { <small>· {{ s.phone }}</small> }
              @if (s.default_commission) {
                <small>· Comisión default: {{ '$' + fmt(s.default_commission) }} / boleta</small>
              }
            </div>
          </div>
        }
      </header>

      @if (loading()) {
        <p class="muted">Cargando asignaciones del vendedor...</p>
      } @else if (!details().length) {
        <app-empty
          icon="assignment_ind"
          title="Sin asignaciones aún"
          description="Asígnale un bloque de boletas en una rifa para que arranque a vender."
        />
      } @else {
        @for (r of details(); track r.raffle_id) {
          <section class="raffle-card">
            <header class="rc-head">
              <div>
                <h2>{{ r.raffle_name }}</h2>
                <div class="rc-meta">
                  <app-chip [tone]="raffleTone(r.raffle_status)">{{ r.raffle_status }}</app-chip>
                  <small>Sorteo final: {{ formatDate(r.final_draw_date) }}</small>
                </div>
              </div>
              <div class="rc-stats">
                <div class="stat">
                  <strong>{{ r.assigned_count }}</strong>
                  <small>asignadas</small>
                </div>
                <div class="stat">
                  <strong class="muted">{{ r.removable_count }}</strong>
                  <small>se pueden quitar</small>
                </div>
                <div class="stat">
                  <strong class="ok">{{ r.available_pool }}</strong>
                  <small>disponibles en rifa</small>
                </div>
              </div>
            </header>

            <div class="rc-actions">
              <app-button
                variant="primary"
                icon="print"
                (click)="openPrintModal(r)">
                Imprimir
              </app-button>
              <app-button
                variant="secondary"
                icon="add"
                [disabled]="r.available_pool === 0"
                (click)="openAddModal(r)">
                Agregar boletas
              </app-button>
            </div>

            <!-- Link personal del vendedor para compartir la rifa por WhatsApp -->
            @if (seller()?.public_slug) {
              <app-seller-share-link
                [slug]="seller()!.public_slug"
                [raffleId]="r.raffle_id"
                [sellerName]="seller()?.full_name ?? ''"
                [raffleName]="r.raffle_name" />
            }

            <div class="ticket-grid">
              @for (t of r.tickets; track t.id) {
                <article class="t-card" [class.t-card--removable]="canRemove(t)" [attr.title]="ticketTitle(t)">
                  <div class="t-card__head">
                    <strong>{{ t.number_label }}</strong>
                    <app-chip [tone]="statusTone(t.status)">{{ statusLabel(t.status) }}</app-chip>
                  </div>
                  @if (t.has_customer) {
                    <small class="muted">Con cliente · {{ '$' + fmt(t.paid_amount) }}</small>
                  } @else {
                    <small class="muted">Sin cliente</small>
                  }
                  @if (canRemove(t)) {
                    <button
                      class="remove-btn"
                      (click)="removeTicket(r, t)"
                      [disabled]="busy()"
                      title="Quitar esta boleta del vendedor">
                      <span class="material-icons">close</span>
                    </button>
                  }
                </article>
              }
            </div>
          </section>
        }
      }
    </div>

    <!-- ============ MODAL IMPRIMIR ============ -->
    <app-modal
      [open]="printOpen()"
      title="Imprimir boletas"
      [subtitle]="printSubtitle()"
      icon="print"
      size="md"
      (close)="closePrintModal()"
    >
      @if (printMode(); as pm) {
        <div class="modal-body">
          <div class="seg">
            <button
              class="seg__opt"
              [class.seg__opt--on]="pm.mode === 'all'"
              (click)="setMode('all')">
              <strong>Todo el bloque</strong>
              <small>{{ currentRaffleTickets().length }} boletas</small>
            </button>
            <button
              class="seg__opt"
              [class.seg__opt--on]="pm.mode === 'select'"
              (click)="setMode('select')">
              <strong>Seleccionar</strong>
              <small>{{ pm.selected.size }} marcadas</small>
            </button>
          </div>

          @if (pm.mode === 'select') {
            <div class="sel-actions">
              <button class="link" (click)="selectAll()">Seleccionar todas</button>
              <button class="link" (click)="clearSelection()">Limpiar</button>
            </div>
            <div class="chip-grid">
              @for (t of currentRaffleTickets(); track t.id) {
                <label class="t-chip" [class.t-chip--on]="pm.selected.has(t.id)">
                  <input
                    type="checkbox"
                    [checked]="pm.selected.has(t.id)"
                    (change)="toggleSelection(t.id)"
                  />
                  <span>{{ t.number_label }}</span>
                </label>
              }
            </div>
          }
        </div>
      }

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closePrintModal()">Cancelar</app-button>
        <app-button
          variant="primary"
          icon="print"
          [disabled]="!canPrint()"
          (click)="goPrint()">
          Imprimir
        </app-button>
      </ng-container>
    </app-modal>

    <!-- ============ MODAL AGREGAR ============ -->
    <app-modal
      [open]="addOpen()"
      title="Agregar más boletas"
      [subtitle]="addSubtitle()"
      icon="add"
      size="sm"
      (close)="closeAddModal()"
    >
      <div class="modal-body">
        <label class="field">
          <span>¿Cuántas boletas más?</span>
          <input
            type="number"
            min="1"
            [max]="addingPool()"
            [(ngModel)]="addQuantity"
            name="addQuantity"
            inputmode="numeric"
          />
        </label>
        <small class="muted">
          Disponibles en la rifa: <strong>{{ addingPool() }}</strong>.
          Se asignan las primeras N libres en orden de número.
        </small>
      </div>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closeAddModal()">Cancelar</app-button>
        <app-button
          variant="primary"
          icon="check"
          [loading]="busy()"
          [disabled]="!canAdd()"
          (click)="doAdd()">
          Agregar
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .head {
      display: flex;
      align-items: center;
      gap: var(--s-3);
      padding-bottom: var(--s-3);
      border-bottom: 1px solid var(--border);
    }
    .back {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
      transition: background var(--t-fast);
    }
    .back:hover { background: var(--bg-input); }
    .info { display: grid; gap: 4px; }
    .info h1 { font-size: 22px; margin: 0; }
    .info-meta { display: flex; flex-wrap: wrap; gap: 6px; color: var(--text-muted); font-size: 12px; }

    .raffle-card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid;
      gap: var(--s-4);
    }
    .rc-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: var(--s-3);
      flex-wrap: wrap;
    }
    .rc-head h2 { font-size: 17px; margin: 0 0 4px; }
    .rc-meta {
      display: flex;
      gap: var(--s-2);
      align-items: center;
      flex-wrap: wrap;
    }
    .rc-meta small { color: var(--text-muted); font-size: 12px; }

    .rc-stats {
      display: flex;
      gap: var(--s-3);
      align-items: stretch;
    }
    .stat {
      display: flex; flex-direction: column; align-items: center;
      padding: 6px 14px;
      background: var(--bg-base);
      border-radius: var(--r-md);
      border: 1px solid var(--border);
      min-width: 70px;
    }
    .stat strong {
      font-size: 18px;
      font-weight: 800;
    }
    .stat strong.ok { color: var(--accent); }
    .stat strong.muted { color: var(--text-muted); }
    .stat small {
      font-size: 10px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }

    .rc-actions {
      display: flex;
      gap: var(--s-2);
      flex-wrap: wrap;
    }

    .ticket-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--s-2);
    }
    .t-card {
      position: relative;
      padding: 10px 12px;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      display: grid;
      gap: 4px;
      transition: border-color var(--t-fast);
    }
    .t-card--removable:hover {
      border-color: var(--danger);
    }
    .t-card__head {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .t-card__head strong { font-size: 14px; font-family: 'Inter', monospace; }
    .t-card small { font-size: 11px; }
    .muted { color: var(--text-muted); }

    .remove-btn {
      position: absolute;
      top: -8px;
      right: -8px;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: var(--danger);
      color: white;
      border: 2px solid var(--bg-surface);
      cursor: pointer;
      display: none;
      align-items: center;
      justify-content: center;
      box-shadow: 0 2px 6px rgba(0,0,0,0.15);
    }
    .t-card--removable:hover .remove-btn { display: flex; }
    .remove-btn .material-icons { font-size: 14px; }
    .remove-btn:hover:not(:disabled) { transform: scale(1.1); }

    /* === Modales === */
    .modal-body { display: grid; gap: var(--s-3); }
    .seg {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--s-2);
    }
    .seg__opt {
      display: grid;
      gap: 4px;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 2px solid var(--border);
      border-radius: var(--r-md);
      cursor: pointer;
      transition: all var(--t-fast);
      text-align: center;
    }
    .seg__opt strong { font-size: 14px; color: var(--text); }
    .seg__opt small { font-size: 11px; color: var(--text-muted); }
    .seg__opt:hover { border-color: var(--accent); }
    .seg__opt--on {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .seg__opt--on strong { color: var(--accent); }

    .sel-actions {
      display: flex;
      gap: var(--s-3);
      justify-content: space-between;
    }
    .link {
      background: transparent;
      border: 0;
      color: var(--accent);
      font-weight: 600;
      font-size: 12px;
      cursor: pointer;
      padding: 0;
    }
    .link:hover { text-decoration: underline; }

    .chip-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
      gap: 6px;
      max-height: 280px;
      overflow-y: auto;
      padding: 8px;
      background: var(--bg-base);
      border-radius: var(--r-md);
    }
    .t-chip {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      padding: 6px 8px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      cursor: pointer;
      font-size: 13px;
      font-family: 'Inter', monospace;
      transition: all var(--t-fast);
    }
    .t-chip input { display: none; }
    .t-chip:hover { border-color: var(--accent); }
    .t-chip--on {
      border-color: var(--accent);
      background: var(--accent-soft);
      color: var(--accent);
      font-weight: 600;
    }

    .field { display: grid; gap: 6px; }
    .field span { font-size: 12px; color: var(--text-muted); font-weight: 600; }
    .field input {
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      border-radius: var(--r-md);
      font-size: 14px;
    }
    .field input:focus { outline: 0; border-color: var(--accent); }
  `],
})
export class SellerDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);
  private readonly confirmSvc = inject(ConfirmService);

  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly seller = signal<SellerUser | null>(null);
  readonly details = signal<RaffleAssignmentDetail[]>([]);

  readonly printOpen = signal(false);
  readonly printMode = signal<PrintMode | null>(null);

  readonly addOpen = signal(false);
  addQuantity = 10;
  private addingRaffleId = 0;

  private sellerId = 0;

  readonly currentRaffleTickets = computed<AssignmentTicketDTO[]>(() => {
    const pm = this.printMode();
    if (!pm) return [];
    const r = this.details().find((x) => x.raffle_id === pm.raffleId);
    return r?.tickets ?? [];
  });

  readonly printSubtitle = computed(() => {
    const pm = this.printMode();
    if (!pm) return '';
    const r = this.details().find((x) => x.raffle_id === pm.raffleId);
    return r ? r.raffle_name : '';
  });

  readonly addSubtitle = computed(() => {
    const r = this.details().find((x) => x.raffle_id === this.addingRaffleId);
    return r ? r.raffle_name : '';
  });

  readonly addingPool = computed(() => {
    const r = this.details().find((x) => x.raffle_id === this.addingRaffleId);
    return r?.available_pool ?? 0;
  });

  ngOnInit(): void {
    const raw = this.route.snapshot.paramMap.get('id');
    this.sellerId = Number(raw);
    if (!this.sellerId) {
      this.router.navigate(['/admin/sellers']);
      return;
    }

    // Cargamos en paralelo el vendedor y sus asignaciones
    this.refresh();
    this.admin.listUsers('seller').subscribe((sellers) => {
      const s = sellers.find((x) => x.id === this.sellerId);
      this.seller.set(s ?? null);
    });
  }

  refresh() {
    this.loading.set(true);
    this.admin.sellerAssignmentsDetail(this.sellerId).subscribe({
      next: (d) => {
        this.details.set(d);
        this.loading.set(false);
      },
      error: () => {
        this.toast.error('Error', 'No se pudieron cargar las asignaciones.');
        this.loading.set(false);
      },
    });
  }

  back() { this.router.navigate(['/admin/sellers']); }

  // ============ Imprimir ============

  openPrintModal(r: RaffleAssignmentDetail) {
    this.printMode.set({ raffleId: r.raffle_id, mode: 'all', selected: new Set() });
    this.printOpen.set(true);
  }
  closePrintModal() { this.printOpen.set(false); }

  setMode(mode: 'all' | 'select') {
    const pm = this.printMode();
    if (!pm) return;
    this.printMode.set({ ...pm, mode });
  }

  toggleSelection(ticketId: number) {
    const pm = this.printMode();
    if (!pm) return;
    const next = new Set(pm.selected);
    if (next.has(ticketId)) next.delete(ticketId);
    else next.add(ticketId);
    this.printMode.set({ ...pm, selected: next });
  }

  selectAll() {
    const pm = this.printMode();
    if (!pm) return;
    const all = new Set(this.currentRaffleTickets().map((t) => t.id));
    this.printMode.set({ ...pm, selected: all });
  }
  clearSelection() {
    const pm = this.printMode();
    if (!pm) return;
    this.printMode.set({ ...pm, selected: new Set() });
  }

  canPrint(): boolean {
    const pm = this.printMode();
    if (!pm) return false;
    if (pm.mode === 'all') return this.currentRaffleTickets().length > 0;
    return pm.selected.size > 0;
  }

  goPrint() {
    const pm = this.printMode();
    if (!pm) return;
    const query: Record<string, string> = {};
    if (pm.mode === 'select' && pm.selected.size > 0) {
      query['ids'] = Array.from(pm.selected).join(',');
    }
    this.printOpen.set(false);
    this.router.navigate(
      ['/admin/print', pm.raffleId, this.sellerId],
      Object.keys(query).length ? { queryParams: query } : undefined,
    );
  }

  // ============ Agregar ============

  openAddModal(r: RaffleAssignmentDetail) {
    this.addingRaffleId = r.raffle_id;
    this.addQuantity = Math.min(10, r.available_pool);
    this.addOpen.set(true);
  }
  closeAddModal() { this.addOpen.set(false); }

  canAdd(): boolean {
    return this.addQuantity > 0 && this.addQuantity <= this.addingPool();
  }

  doAdd() {
    if (!this.canAdd()) return;
    this.busy.set(true);
    this.admin.assignMore(this.addingRaffleId, this.sellerId, this.addQuantity).subscribe({
      next: (r) => {
        this.busy.set(false);
        this.closeAddModal();
        const msg = r.partial
          ? `Se asignaron ${r.assigned} de ${r.requested} (no había más disponibles)`
          : `Se asignaron ${r.assigned} boletas más al vendedor`;
        this.toast.success('Boletas asignadas', msg);
        this.refresh();
      },
      error: (e) => {
        this.busy.set(false);
        this.toast.error('No se pudo asignar', e?.error?.detail ?? 'Intenta de nuevo.');
      },
    });
  }

  // ============ Quitar ============

  canRemove(t: AssignmentTicketDTO): boolean {
    return t.status === 'available' && !t.has_customer;
  }

  removeTicket(r: RaffleAssignmentDetail, t: AssignmentTicketDTO) {
    this.confirmSvc.ask({
      title: 'Quitar boleta del vendedor',
      message: `¿Confirmas que quieres quitar la boleta ${t.number_label} de ${this.seller()?.full_name}? Volverá al pool de disponibles.`,
      tone: 'warning',
      icon: 'remove_circle',
      confirmLabel: 'Sí, quitar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.busy.set(true);
      this.admin.unassignTickets(r.raffle_id, this.sellerId, { ticket_ids: [t.id] }).subscribe({
        next: () => {
          this.busy.set(false);
          this.toast.success('Boleta quitada', `${t.number_label} liberada al pool.`);
          this.refresh();
        },
        error: (e) => {
          this.busy.set(false);
          this.toast.error('No se pudo quitar', e?.error?.detail ?? 'Intenta de nuevo.');
        },
      });
    });
  }

  // ============ Helpers ============

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  formatDate(iso: string): string {
    const d = new Date(iso + (iso.length === 10 ? 'T12:00:00' : ''));
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  raffleTone(status: string): 'accent' | 'default' | 'danger' {
    if (status === 'active') return 'accent';
    if (status === 'cancelled' || status === 'finished') return 'default';
    return 'default';
  }

  statusTone(s: string): 'accent' | 'default' | 'warning' | 'paid' | 'danger' | 'info' {
    switch (s) {
      case 'available': return 'default';
      case 'reserved': return 'warning';
      case 'pending_payment': return 'warning';
      case 'partially_paid': return 'info';
      case 'paid': return 'paid';
      case 'winning': return 'accent';
      case 'expired': return 'danger';
      default: return 'default';
    }
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      available: 'Libre',
      reserved: 'Reservada',
      pending_payment: 'Por pagar',
      partially_paid: 'Cuota',
      paid: 'Pagada',
      winning: 'Ganadora',
      expired: 'Expirada',
    };
    return map[s] ?? s;
  }

  ticketTitle(t: AssignmentTicketDTO): string {
    if (this.canRemove(t)) return 'Puedes quitarla — pasa el mouse para ver el botón';
    return 'No se puede quitar (tiene cliente o reserva)';
  }
}
