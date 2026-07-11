import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Raffle } from '@core/models/raffle.model';
import {
  ActiveReservation,
  ManualTransferSubmission,
  PublicSalesAdminService,
  WompiConfig,
  WompiConfigInput,
} from '@core/services/public-sales-admin.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';

/**
 * Panel de configuración de VENTA PÚBLICA para el admin.
 *
 * 3 secciones:
 *   1. Configurar Wompi del tenant (llaves y entorno)
 *   2. Toggle público/privado + habilitación de compra online por rifa
 *   3. Bandeja de transferencias manuales pendientes de revisión
 *
 * Ruta: /admin/publico
 */
@Component({
  selector: 'app-public-sales-config',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Venta pública online</h1>
          <p class="muted">Configura Wompi, activa la compra pública por rifa y revisa transferencias.</p>
        </div>
      </header>

      <!-- ============ CONFIG WOMPI ============ -->
      <section class="card">
        <h2>Wompi (pasarela de pago)</h2>
        <p class="muted">
          Registra las llaves de tu cuenta Wompi. Las llaves privadas se guardan cifradas.
          <a href="https://comercios.wompi.co/" target="_blank" rel="noopener">Crear cuenta gratis</a>
        </p>

        <div class="wompi-status">
          @if (wompiConfig(); as w) {
            <div class="status-grid">
              <div><small>Public key</small><strong>{{ w.public_key ? (w.public_key | slice:0:20) + '...' : '—' }}</strong></div>
              <div><small>Entorno</small><strong>{{ w.env }}</strong></div>
              <div><small>Private key</small><strong>{{ w.private_key_configured ? '✓ configurada' : '—' }}</strong></div>
              <div><small>Webhook</small><strong>{{ w.webhook_secret_configured ? '✓' : '—' }}</strong></div>
              <div><small>Integrity</small><strong>{{ w.integrity_key_configured ? '✓' : '—' }}</strong></div>
            </div>
          }
        </div>

        <form class="form" (ngSubmit)="saveWompi()">
          <label class="field">
            <span>Entorno</span>
            <select [(ngModel)]="wompiForm.env" name="env">
              <option value="sandbox">Sandbox (pruebas)</option>
              <option value="production">Producción</option>
            </select>
          </label>
          <label class="field">
            <span>Public key</span>
            <input type="text" [(ngModel)]="wompiForm.public_key" name="pk" placeholder="pub_prod_XXXX" />
          </label>
          <label class="field">
            <span>Private key</span>
            <input type="password" [(ngModel)]="wompiForm.private_key" name="sk" placeholder="prv_prod_XXXX" />
          </label>
          <label class="field">
            <span>Webhook secret</span>
            <input type="password" [(ngModel)]="wompiForm.webhook_secret" name="ws" />
          </label>
          <label class="field">
            <span>Integrity key</span>
            <input type="password" [(ngModel)]="wompiForm.integrity_key" name="ik" />
          </label>
          <div class="form__cta">
            <button type="submit" class="btn primary" [disabled]="savingWompi()">
              {{ savingWompi() ? 'Guardando...' : 'Guardar credenciales Wompi' }}
            </button>
          </div>
        </form>
      </section>

      <!-- ============ RIFAS: TOGGLE PÚBLICO ============ -->
      <section class="card">
        <h2>Rifas — habilitación pública</h2>
        <p class="muted">Elige qué rifas se ven en el portal público y cuáles aceptan pago Wompi o transferencia manual.</p>

        @if (loadingRaffles()) {
          <p class="muted">Cargando rifas...</p>
        } @else if (!raffles().length) {
          <p class="muted">No hay rifas creadas todavía.</p>
        } @else {
          <ul class="raffle-list">
            @for (r of raffles(); track r.id) {
              <li class="raffle-row">
                <div class="raffle-row__info">
                  <strong>{{ r.name }}</strong>
                  <small>{{ r.total_tickets }} boletas · \${{ formatNumber(r.ticket_price) }} c/u</small>
                </div>
                <div class="raffle-row__actions">
                  <label class="toggle">
                    <input type="checkbox"
                           [checked]="!!r.is_public"
                           (change)="toggleRaffle(r, 'is_public', $any($event.target).checked)" />
                    <span>Pública</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox"
                           [checked]="!!r.enable_online_purchase"
                           (change)="toggleRaffle(r, 'enable_online_purchase', $any($event.target).checked)" />
                    <span>Wompi</span>
                  </label>
                  <label class="toggle">
                    <input type="checkbox"
                           [checked]="!!r.enable_manual_transfer"
                           (change)="toggleRaffle(r, 'enable_manual_transfer', $any($event.target).checked)" />
                    <span>Transferencia manual</span>
                  </label>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ============ RESERVAS ACTIVAS ============ -->
      <section class="card">
        <div class="card__head">
          <h2>Reservas activas</h2>
          <label class="filter-toggle">
            <input type="checkbox" [(ngModel)]="onlyScheduled" (change)="loadReservations()" />
            Solo con fecha programada
          </label>
        </div>
        <p class="muted">
          Clientes que reservaron boletas pero aún no han pagado. Toca el
          botón de WhatsApp para escribirles directamente desde tu celular.
        </p>

        @if (reservations().length === 0) {
          <p class="muted">No hay reservas activas.</p>
        } @else {
          <ul class="res-list">
            @for (r of reservations(); track r.customer_id + '-' + r.raffle_id) {
              <li class="res">
                <div class="res__row">
                  <div class="res__customer">
                    <strong>{{ r.customer_name }}</strong>
                    @if (r.customer_phone) {
                      <small>{{ r.customer_phone }}</small>
                    }
                    @if (r.customer_email) {
                      <small class="mono">{{ r.customer_email }}</small>
                    }
                  </div>
                  <div class="res__amount">
                    \${{ formatNumber(r.ticket_price * r.ticket_labels.length) }}
                  </div>
                </div>
                <div class="res__meta">
                  <span>{{ r.raffle_name }}</span>
                  <span>· {{ r.ticket_labels.length }} boleta(s): {{ r.ticket_labels.slice(0, 8).join(', ') }}{{ r.ticket_labels.length > 8 ? '…' : '' }}</span>
                  @if (r.scheduled_payment_date) {
                    <span class="res__badge">
                      📅 Pagará el {{ formatDate(r.scheduled_payment_date) }}
                    </span>
                  } @else {
                    <span class="res__badge res__badge--warn">
                      ⏳ Reserva vence {{ formatDate(r.expires_at) }}
                    </span>
                  }
                  @if (r.reminder_sent_at) {
                    <span class="res__badge res__badge--ok">✓ Ya se envió recordatorio</span>
                  }
                </div>
                <div class="res__cta">
                  @if (r.customer_phone) {
                    <a class="btn wa" [href]="whatsappLink(r)" target="_blank" rel="noopener">
                      <span class="material-icons">chat</span>
                      Enviar WhatsApp
                    </a>
                  } @else {
                    <span class="muted">Sin teléfono registrado</span>
                  }
                  <button type="button" class="btn btn--primary"
                          (click)="openMarkPaid(r)">
                    <span class="material-icons">payments</span>
                    Registrar pago
                  </button>
                </div>
              </li>
            }
          </ul>
        }
      </section>

      <!-- ============ MODAL: Registrar pago manual ============ -->
      @if (markPaidTarget(); as target) {
        <div class="modal" (click)="closeMarkPaid()">
          <div class="modal__card" (click)="$event.stopPropagation()">
            <div class="modal__head">
              <div>
                <div class="pill">Registrar pago</div>
                <h2>Pago recibido de {{ target.customer_name }}</h2>
                <p class="muted">
                  {{ target.ticket_labels.length }} boleta(s): {{ target.ticket_labels.join(', ') }}
                  · Rifa {{ target.raffle_name }}
                </p>
              </div>
              <button class="icon-btn" (click)="closeMarkPaid()" aria-label="Cerrar">
                <span class="material-icons">close</span>
              </button>
            </div>
            <form class="form" (ngSubmit)="submitMarkPaid()" autocomplete="off">
              <label class="field">
                <span class="field__label">Monto recibido (COP)</span>
                <input class="input" type="number" min="1" step="1000"
                       [(ngModel)]="markPaidForm.amount" name="amount" required />
                <small class="muted">
                  Total sugerido: \${{ formatNumber(target.ticket_price * target.ticket_labels.length) }}
                </small>
              </label>
              <label class="field">
                <span class="field__label">Método de pago</span>
                <select class="input" [(ngModel)]="markPaidForm.payment_method"
                        name="method" required>
                  <option value="NEQUI">Nequi</option>
                  <option value="DAVIPLATA">Daviplata</option>
                  <option value="BANCOLOMBIA_TRANSFER">Bancolombia (transferencia)</option>
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="OTHER">Otro</option>
                </select>
              </label>
              <label class="field">
                <span class="field__label">Referencia <small>opcional</small></span>
                <input class="input" type="text" maxlength="80"
                       [(ngModel)]="markPaidForm.reference" name="reference"
                       placeholder="Ej. ID de la transacción, últimos 4 dígitos" />
              </label>
              <label class="field">
                <span class="field__label">Notas <small>opcional</small></span>
                <textarea class="input" rows="2" maxlength="500"
                          [(ngModel)]="markPaidForm.notes" name="notes"
                          placeholder="Ej. Comprobante recibido por WhatsApp el 11/07"></textarea>
              </label>
              @if (markPaidError()) {
                <div class="alert alert--error">{{ markPaidError() }}</div>
              }
              <div class="modal__actions">
                <button type="button" class="btn btn--ghost" (click)="closeMarkPaid()"
                        [disabled]="markingPaid()">
                  Cancelar
                </button>
                <button type="submit" class="btn btn--primary"
                        [disabled]="markingPaid() || !markPaidForm.amount">
                  @if (markingPaid()) {
                    <span class="btn__spin"></span> Guardando…
                  } @else {
                    <span class="material-icons">check</span>
                    Confirmar pago
                  }
                </button>
              </div>
            </form>
          </div>
        </div>
      }

      <!-- ============ TRANSFERENCIAS PENDIENTES ============ -->
      <section class="card">
        <h2>Transferencias por revisar</h2>
        @if (transfers().length === 0) {
          <p class="muted">No hay transferencias pendientes.</p>
        } @else {
          <ul class="transfer-list">
            @for (t of transfers(); track t.id) {
              <li class="transfer">
                <div class="transfer__head">
                  <div>
                    <strong>{{ t.customer_name || 'Cliente' }}</strong>
                    <small>{{ t.customer_phone }}</small>
                  </div>
                  <div class="transfer__amount">
                    \${{ formatNumber(t.amount_declared) }}
                  </div>
                </div>
                <div class="transfer__meta">
                  <span>{{ t.raffle_name }}</span>
                  <span>· {{ t.payment_method }}</span>
                  <span>· {{ t.ticket_ids.length }} boleta(s)</span>
                  @if (t.reference) { <span>· ref {{ t.reference }}</span> }
                </div>
                @if (t.proof_url) {
                  <a class="proof" [href]="t.proof_url" target="_blank">
                    <span class="material-icons">image</span>
                    Ver comprobante
                  </a>
                }
                <div class="transfer__cta">
                  <button class="btn ghost" (click)="reviewTransfer(t, false)">Rechazar</button>
                  <button class="btn primary" (click)="reviewTransfer(t, true)">Aprobar</button>
                </div>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; color: var(--text); }
    .page { max-width: 900px; margin: 0 auto; padding: var(--s-5); }
    .page__head { margin-bottom: var(--s-5); }
    .page__head h1 { margin: 0; font-size: 24px; }
    .muted { color: var(--text-muted); font-size: 13px; }

    .card {
      background: var(--bg-card);
      border-radius: var(--r-lg);
      padding: var(--s-5);
      margin-bottom: var(--s-4);
      border: 1px solid var(--border);
    }
    .card h2 { margin: 0 0 var(--s-2); font-size: 18px; }

    .wompi-status { margin: var(--s-3) 0; }
    .status-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--s-2);
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
    }
    .status-grid div { display: grid; }
    .status-grid small { color: var(--text-muted); font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; }
    .status-grid strong { font-size: 13px; font-family: 'Courier New', monospace; }

    .form { display: grid; grid-template-columns: repeat(2, 1fr); gap: var(--s-3); margin-top: var(--s-3); }
    .field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .field span { font-weight: 500; letter-spacing: 0.02em; text-transform: uppercase; }
    .field input, .field select {
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      border-radius: var(--r-md);
      font-size: 14px;
    }
    .field input:focus, .field select:focus { outline: none; border-color: var(--accent); }
    .form__cta { grid-column: 1 / -1; display: flex; justify-content: flex-end; margin-top: var(--s-2); }

    .btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 16px;
      border-radius: var(--r-md);
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
    }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn.primary { background: var(--accent); color: #0a0e0c; }
    .btn.ghost { background: transparent; border-color: var(--border); color: var(--text); }

    .raffle-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .raffle-row {
      display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap;
      gap: var(--s-3);
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
    }
    .raffle-row__info strong { display: block; }
    .raffle-row__info small { display: block; color: var(--text-muted); font-size: 12px; }
    .raffle-row__actions { display: flex; gap: var(--s-3); flex-wrap: wrap; }

    .toggle {
      display: flex; align-items: center; gap: 6px;
      font-size: 12px;
      cursor: pointer;
      user-select: none;
    }
    .toggle input { width: 16px; height: 16px; cursor: pointer; }

    /* ============ Reservas activas ============ */
    .card__head {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--s-3); flex-wrap: wrap;
    }
    .filter-toggle {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 12px; color: var(--text-muted);
      cursor: pointer; user-select: none;
    }
    .filter-toggle input { width: 14px; height: 14px; cursor: pointer; }

    .res-list { list-style: none; padding: 0; margin: var(--s-3) 0 0; display: grid; gap: var(--s-3); }
    .res {
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
      border-left: 3px solid var(--accent);
      display: grid;
      grid-template-columns: 1fr auto;
      gap: var(--s-2);
      align-items: start;
    }
    .res__row {
      grid-column: 1 / -1;
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: var(--s-3);
    }
    .res__customer { display: grid; gap: 2px; }
    .res__customer strong { color: var(--text); font-size: 14px; }
    .res__customer small {
      color: var(--text-muted); font-size: 12px;
    }
    .res__customer .mono { font-family: 'Courier New', monospace; font-size: 11px; }
    .res__amount { font-size: 16px; font-weight: 700; color: var(--accent); white-space: nowrap; }

    .res__meta {
      grid-column: 1 / -1;
      display: flex; gap: 6px; flex-wrap: wrap;
      font-size: 11.5px; color: var(--text-muted);
      align-items: center;
    }
    .res__badge {
      padding: 2px 8px;
      background: rgba(255,255,255,0.06);
      border-radius: 999px;
      font-size: 10.5px;
      font-weight: 600;
      white-space: nowrap;
    }
    .res__badge--warn { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
    .res__badge--ok { background: rgba(34, 197, 94, 0.15); color: #22c55e; }

    .res__cta { grid-column: 1 / -1; display: flex; justify-content: flex-end; }
    .btn.wa {
      display: inline-flex; align-items: center; gap: 6px;
      background: #25d366; color: #fff; border-color: transparent;
      text-decoration: none;
      padding: 8px 14px;
    }
    .btn.wa:hover { background: #1fbc59; }
    .btn.wa .material-icons { font-size: 16px; }

    .transfer-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-3); }
    .transfer {
      padding: var(--s-3);
      background: var(--bg-input);
      border-radius: var(--r-md);
      border-left: 3px solid var(--warning);
    }
    .transfer__head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: var(--s-2); }
    .transfer__head strong { display: block; }
    .transfer__head small { color: var(--text-muted); font-size: 12px; }
    .transfer__amount { font-size: 18px; font-weight: 700; }
    .transfer__meta { display: flex; gap: 6px; font-size: 12px; color: var(--text-muted); margin-bottom: var(--s-2); flex-wrap: wrap; }
    .proof { display: inline-flex; align-items: center; gap: 4px; color: var(--accent); font-size: 12px; margin-bottom: var(--s-2); }
    .transfer__cta { display: flex; gap: var(--s-2); justify-content: flex-end; }
  `],
})
export class PublicSalesConfigComponent implements OnInit {
  private readonly svc = inject(PublicSalesAdminService);
  private readonly raffleSvc = inject(RaffleService);
  private readonly toast = inject(ToastService);

  wompiConfig = signal<WompiConfig | null>(null);
  raffles = signal<Raffle[]>([]);
  transfers = signal<ManualTransferSubmission[]>([]);
  reservations = signal<ActiveReservation[]>([]);
  onlyScheduled = false;
  loadingRaffles = signal(true);
  savingWompi = signal(false);

  wompiForm: WompiConfigInput = {
    env: 'sandbox',
    public_key: '',
    private_key: '',
    webhook_secret: '',
    integrity_key: '',
  };

  markPaidTarget = signal<ActiveReservation | null>(null);
  markingPaid = signal(false);
  markPaidError = signal<string | null>(null);
  markPaidForm: {
    amount: number | null;
    payment_method: 'NEQUI' | 'DAVIPLATA' | 'BANCOLOMBIA_TRANSFER' | 'EFECTIVO' | 'OTHER';
    reference: string;
    notes: string;
  } = {
    amount: null,
    payment_method: 'NEQUI',
    reference: '',
    notes: '',
  };

  ngOnInit(): void {
    this.svc.getWompiConfig().subscribe({
      next: (w) => {
        this.wompiConfig.set(w);
        this.wompiForm.env = w.env;
        this.wompiForm.public_key = w.public_key;
      },
      error: () => {},
    });

    this.raffleSvc.list().subscribe({
      next: (r) => { this.raffles.set(r); this.loadingRaffles.set(false); },
      error: () => this.loadingRaffles.set(false),
    });

    this.loadTransfers();
    this.loadReservations();
  }

  loadTransfers() {
    this.svc.listManualTransfers().subscribe({
      next: (list) => this.transfers.set(list),
      error: () => {},
    });
  }

  loadReservations() {
    this.svc.listActiveReservations({ onlyScheduled: this.onlyScheduled }).subscribe({
      next: (list) => this.reservations.set(list),
      error: () => {},
    });
  }

  /** Mensaje pre-cargado para el WhatsApp del cliente. El admin puede
   *  editarlo antes de enviar. */
  whatsappLink(r: ActiveReservation): string {
    const phone = (r.customer_phone || '').replace(/[^0-9]/g, '');
    const normalized = phone.startsWith('57') ? phone : `57${phone}`;
    const total = r.ticket_price * r.ticket_labels.length;
    const totalFmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(total);
    const firstName = (r.customer_name || '').trim().split(/\s+/)[0] || '';
    const boletas = r.ticket_labels.join(', ');
    const deadline = r.scheduled_payment_date
      ? `el ${this.formatDate(r.scheduled_payment_date)}`
      : `antes de ${this.formatDate(r.expires_at)}`;

    const msg =
`¡Hola ${firstName}! 👋

Te escribo para recordarte que tienes reservada(s) la(s) boleta(s) ${boletas} de la rifa "${r.raffle_name}".

💰 Total a pagar: $${totalFmt}
📅 Fecha límite para pagar: ${deadline}

📲 Puedes transferir a:
Nequi: 3207345154
(a nombre de Edith J. Madera)

Cuando hagas el pago, envíame el comprobante por aquí para confirmarlo. ¡Gracias! 🙌`;

    return `https://wa.me/${normalized}?text=${encodeURIComponent(msg)}`;
  }

  openMarkPaid(r: ActiveReservation) {
    this.markPaidTarget.set(r);
    this.markPaidError.set(null);
    this.markPaidForm = {
      amount: r.ticket_price * r.ticket_labels.length,
      payment_method: 'NEQUI',
      reference: '',
      notes: '',
    };
  }

  closeMarkPaid() {
    if (this.markingPaid()) return;
    this.markPaidTarget.set(null);
    this.markPaidError.set(null);
  }

  submitMarkPaid() {
    const target = this.markPaidTarget();
    if (!target || this.markingPaid()) return;
    const amount = Number(this.markPaidForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      this.markPaidError.set('El monto debe ser mayor a 0.');
      return;
    }
    this.markingPaid.set(true);
    this.markPaidError.set(null);
    this.svc.markReservationsPaid({
      reservation_ids: target.reservation_ids,
      amount,
      payment_method: this.markPaidForm.payment_method,
      reference: this.markPaidForm.reference.trim() || null,
      notes: this.markPaidForm.notes.trim() || null,
    }).subscribe({
      next: (resp) => {
        this.markingPaid.set(false);
        this.markPaidTarget.set(null);
        this.toast.success(
          'Pago registrado',
          `Boletas ${resp.ticket_labels.join(', ')} marcadas como pagadas.`,
        );
        this.loadReservations();
      },
      error: (e) => {
        this.markingPaid.set(false);
        this.markPaidError.set(e?.error?.detail ?? 'No se pudo registrar el pago.');
      },
    });
  }

  formatDate(iso: string | null | undefined): string {
    if (!iso) return '—';
    const d = new Date(iso.length === 10 ? iso + 'T12:00:00' : iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  saveWompi() {
    if (this.savingWompi()) return;
    if (!this.wompiForm.public_key || !this.wompiForm.private_key || !this.wompiForm.webhook_secret || !this.wompiForm.integrity_key) {
      this.toast.error('Faltan campos', 'Completa las 4 llaves de Wompi.');
      return;
    }
    this.savingWompi.set(true);
    this.svc.updateWompiConfig(this.wompiForm).subscribe({
      next: (w) => {
        this.wompiConfig.set(w);
        this.savingWompi.set(false);
        // Limpiar campos de secret (ya se guardaron)
        this.wompiForm.private_key = '';
        this.wompiForm.webhook_secret = '';
        this.wompiForm.integrity_key = '';
        this.toast.success('Guardado', 'Credenciales Wompi actualizadas.');
      },
      error: (e) => {
        this.savingWompi.set(false);
        this.toast.error('Error', e?.error?.detail ?? 'No se pudo guardar.');
      },
    });
  }

  toggleRaffle(raffle: Raffle, field: string, value: boolean) {
    const payload: any = { [field]: value };
    this.svc.updateRafflePublicConfig(raffle.id, payload).subscribe({
      next: () => {
        // Actualiza local
        this.raffles.update((list) => list.map((r) => r.id === raffle.id ? { ...r, [field]: value } as any : r));
        this.toast.success('Actualizado', `${raffle.name}: ${field} = ${value}`);
      },
      error: (e) => {
        this.toast.error('Error', e?.error?.detail ?? 'No se pudo actualizar.');
        // Recarga estado
        this.raffleSvc.list().subscribe((r) => this.raffles.set(r));
      },
    });
  }

  reviewTransfer(t: ManualTransferSubmission, approve: boolean) {
    const label = approve ? 'aprobar' : 'rechazar';
    if (!confirm(`¿Confirmas ${label} esta transferencia por $${this.formatNumber(t.amount_declared)}?`)) return;

    const notes = approve ? undefined : (prompt('Motivo del rechazo (opcional):') || undefined);

    this.svc.reviewTransfer(t.id, approve, notes).subscribe({
      next: () => {
        this.toast.success(approve ? 'Aprobado' : 'Rechazado', `Transferencia procesada.`);
        this.loadTransfers();
      },
      error: (e) => {
        this.toast.error('Error', e?.error?.detail ?? 'No se pudo procesar.');
      },
    });
  }

  formatNumber(n: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(n);
  }
}
