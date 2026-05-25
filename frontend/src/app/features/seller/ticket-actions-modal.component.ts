import { CommonModule } from '@angular/common';
import {
  Component, EventEmitter, Output, computed, effect, inject, input, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Raffle, Ticket } from '@core/models/raffle.model';
import { Customer } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';
import { ConfirmService } from '@core/services/confirm.service';
import { RaffleService } from '@core/services/raffle.service';
import { ShareService } from '@core/services/share.service';
import { TicketCaptureService } from '@core/services/ticket-capture.service';
import { ToastService } from '@core/services/toast.service';
import { CountdownComponent } from '@shared/components/countdown/countdown.component';
import { TicketDesignComponent } from '@shared/components/ticket-design/ticket-design.component';
import {
  ButtonComponent, ChipComponent, InputComponent, ModalComponent,
} from '@shared/ui';
import { ReportPaymentModalComponent } from './report-payment-modal.component';

@Component({
  selector: 'app-ticket-actions-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, ChipComponent, InputComponent, ModalComponent,
    CountdownComponent, TicketDesignComponent,
    ReportPaymentModalComponent,
  ],
  template: `
    <app-modal
      [open]="open()"
      [title]="modalTitle()"
      [subtitle]="modalSubtitle()"
      size="lg"
      (close)="onClose()"
    >
      @if (ticket(); as t) {
        <div class="layout">
          <!-- Preview de la boleta -->
          <div class="preview">
            <app-ticket-design
              [ticket]="t"
              [raffleName]="raffle().name"
              [prizes]="raffle().prizes"
              [primaryColor]="raffle().primary_color || '#1e8e54'"
              [responsibleName]="raffle().responsible_name ?? null"
              [responsiblePhone]="raffle().responsible_phone ?? null"
              [verifyUrl]="origin + '/verify/' + t.code"
            />
            <div class="preview__status">
              <app-chip [tone]="statusTone(t.status)">{{ statusLabel(t.status) }}</app-chip>
              <small class="code">Código: {{ t.code }}</small>
            </div>
          </div>

          <!-- Panel derecho según estado -->
          <div class="side">

            <!-- ========= DISPONIBLE: formulario de reserva ========= -->
            @if (t.status === 'available') {
              <h3>Reservar para un cliente</h3>

              @if (!showNewCustomerForm()) {
                <app-input
                  placeholder="Buscar cliente..."
                  icon="search"
                  [(ngModel)]="search"
                  name="search"
                  (input)="searchCustomers()"
                />
                <div class="customer-list">
                  @if (loadingCustomers()) {
                    <p class="muted">Cargando...</p>
                  } @else if (!customers().length) {
                    <p class="muted">No hay clientes. Crea uno con el botón de abajo.</p>
                  } @else {
                    @for (c of customers(); track c.id) {
                      <button class="cust" [class.cust--selected]="selectedCustomerId() === c.id" (click)="selectCustomer(c.id)">
                        <span class="cust__avatar">{{ initials(c.full_name) }}</span>
                        <div class="cust__info">
                          <strong>{{ c.full_name }}</strong>
                          <small class="muted">{{ c.phone }}{{ c.document ? ' · ' + c.document : '' }}</small>
                        </div>
                        @if (selectedCustomerId() === c.id) {
                          <span class="material-icons cust__check">check_circle</span>
                        }
                      </button>
                    }
                  }
                </div>
                <app-button variant="ghost" icon="person_add" (click)="toggleNewForm()">
                  Nuevo cliente
                </app-button>
              } @else {
                <form class="new-form">
                  <app-input label="Nombre completo *" [(ngModel)]="newCust.full_name" name="full_name" icon="person" />
                  <div class="form__row">
                    <app-input label="Teléfono *" [(ngModel)]="newCust.phone" name="phone" icon="phone" inputmode="tel" />
                    <app-input label="Documento" [(ngModel)]="newCust.document" name="document" icon="badge" />
                  </div>
                  <div class="form__row form__row--actions">
                    <app-button variant="secondary" (click)="toggleNewForm()">Cancelar</app-button>
                    <app-button variant="primary" icon="check" [loading]="creatingCust()" (click)="createCustomer()">
                      Crear y seleccionar
                    </app-button>
                  </div>
                </form>
              }
            }

            <!-- ========= RESERVADA / PENDING / PARTIALLY_PAID: ver detalle + acciones ========= -->
            @else if (t.status === 'reserved' || t.status === 'pending_payment' || t.status === 'partially_paid') {
              <h3>
                @switch (t.status) {
                  @case ('reserved') { Reservada }
                  @case ('pending_payment') { Pendiente de confirmación }
                  @case ('partially_paid') { Pago parcial · faltan {{ '$' + fmt(remainingAmount()) }} }
                }
              </h3>

              <!-- Barra de progreso del pago -->
              @if (ticketPrice() > 0 && (t.status === 'partially_paid' || (t.paid_amount ?? 0) > 0)) {
                <div class="pay-progress">
                  <div class="pay-progress__head">
                    <small class="muted">Pagado hasta ahora</small>
                    <strong>
                      {{ '$' + fmt(t.paid_amount ?? 0) }}
                      <span class="muted">/ {{ '$' + fmt(ticketPrice()) }}</span>
                    </strong>
                  </div>
                  <div class="pay-progress__bar">
                    <div class="pay-progress__fill" [style.width.%]="paidPct()"></div>
                  </div>
                  <small class="muted">{{ paidPct() }}% cubierto · faltan {{ '$' + fmt(remainingAmount()) }}</small>
                </div>
              }

              @if (t.customer; as c) {
                <div class="info-block">
                  <small class="muted">Cliente</small>
                  <strong>{{ c.full_name }}</strong>
                  <small>{{ c.phone }}{{ c.document ? ' · ' + c.document : '' }}</small>
                  @if (c.email) { <small class="muted">{{ c.email }}</small> }
                </div>
              }

              @if (t.seller; as s) {
                <div class="info-block">
                  <small class="muted">Reservada por</small>
                  <strong>{{ s.full_name }}</strong>
                  <small class="muted">{{ s.email }}</small>
                </div>
              }

              @if (t.reservation_expires_at) {
                <div class="info-block">
                  <small class="muted">Expira en (auto-libera si no se paga)</small>
                  <app-countdown [seconds]="secondsToExpire()" />
                  @if (isAdmin()) {
                    <app-button variant="secondary" size="sm" icon="schedule"
                                [loading]="extending()" (click)="extendReservation()">
                      {{ extending() ? 'Extendiendo...' : 'Extender 24h' }}
                    </app-button>
                  }
                </div>
              }

              <!-- Compartir/Descargar disponible desde el momento de la reserva
                   para que el cliente sepa sus números asignados. -->
              <div class="share-actions">
                <app-button variant="primary" icon="share" [loading]="sharing()" [full]="true" (click)="shareWhatsApp()">
                  {{ sharing() ? 'Preparando...' : 'Compartir por WhatsApp' }}
                </app-button>
                <div class="share-actions__row">
                  <app-button variant="secondary" icon="image" [loading]="downloadingImage()" [full]="true" (click)="downloadImage()">
                    {{ downloadingImage() ? 'Descargando...' : 'Descargar imagen' }}
                  </app-button>
                  <app-button variant="secondary" icon="picture_as_pdf" [loading]="downloadingPdf()" [full]="true" (click)="downloadPdf()">
                    {{ downloadingPdf() ? 'Descargando...' : 'Descargar PDF' }}
                  </app-button>
                </div>
              </div>
            }

            <!-- ========= PAGADA / GANADORA: solo info ========= -->
            @else if (t.status === 'paid' || t.status === 'winning') {
              <h3>{{ t.status === 'winning' ? '🏆 Boleta ganadora' : '✓ Boleta pagada' }}</h3>

              @if (t.customer; as c) {
                <div class="info-block">
                  <small class="muted">Propietario</small>
                  <strong>{{ c.full_name }}</strong>
                  <small>{{ c.phone }}{{ c.document ? ' · ' + c.document : '' }}</small>
                </div>
              }
              @if (t.seller; as s) {
                <div class="info-block">
                  <small class="muted">Vendida por</small>
                  <strong>{{ s.full_name }}</strong>
                </div>
              }

              <div class="share-actions">
                <app-button variant="primary" icon="share" [loading]="sharing()" [full]="true" (click)="shareWhatsApp()">
                  {{ sharing() ? 'Preparando...' : 'Compartir por WhatsApp' }}
                </app-button>
                <div class="share-actions__row">
                  <app-button variant="secondary" icon="image" [loading]="downloadingImage()" [full]="true" (click)="downloadImage()">
                    {{ downloadingImage() ? 'Descargando...' : 'Descargar imagen' }}
                  </app-button>
                  <app-button variant="secondary" icon="picture_as_pdf" [loading]="downloadingPdf()" [full]="true" (click)="downloadPdf()">
                    {{ downloadingPdf() ? 'Descargando...' : 'Descargar PDF' }}
                  </app-button>
                </div>
              </div>
            }

            @if (error()) {
              <div class="alert">
                <span class="material-icons">error_outline</span>{{ error() }}
              </div>
            }
          </div>
        </div>
      }

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="onClose()">Cerrar</app-button>

        @if (ticket()?.status === 'available') {
          <app-button
            variant="primary" icon="lock"
            [loading]="reserving()" [disabled]="!selectedCustomerId()"
            (click)="reserve()"
          >
            {{ reserving() ? 'Reservando...' : 'Reservar boleta' }}
          </app-button>
        }

        @if (ticket()?.status === 'reserved' || ticket()?.status === 'pending_payment' || ticket()?.status === 'partially_paid') {
          @if (ticket()?.status !== 'partially_paid' || isAdmin()) {
            <app-button variant="danger" icon="lock_open" [loading]="releasing()" (click)="release()">
              {{ releasing() ? 'Liberando...' : 'Liberar' }}
            </app-button>
          }

          @if (ticket()?.status === 'reserved' || ticket()?.status === 'partially_paid') {
            <app-button variant="primary" icon="cloud_upload" (click)="openReportPayment()">
              {{ ticket()?.status === 'partially_paid' ? 'Reportar otra cuota' : 'Reportar pago' }}
            </app-button>
          }

          @if (isAdmin()) {
            <app-button variant="primary" icon="check_circle" [loading]="markingPaid()" (click)="markPaid()">
              {{ markingPaid() ? 'Marcando...' : 'Marcar pagada (admin)' }}
            </app-button>
          }
        }
      </ng-container>
    </app-modal>

    <!-- Modal de reportar pago con comprobante -->
    <app-report-payment-modal
      [open]="reportPaymentOpen()"
      [ticket]="ticket()"
      [defaultAmount]="remainingAmount() || ticketPrice()"
      [maxAmount]="remainingAmount() || ticketPrice()"
      (close)="reportPaymentOpen.set(false)"
      (submitted)="onPaymentSubmitted($event)"
    />
  `,
  styles: [`
    .layout { display: grid; gap: var(--s-5); grid-template-columns: 1fr; }
    @media (min-width: 720px) { .layout { grid-template-columns: auto 1fr; align-items: start; } }

    .preview { display: grid; gap: var(--s-3); justify-items: start; }
    .preview__status { display: flex; align-items: center; gap: var(--s-3); flex-wrap: wrap; }
    .code { font-family: var(--font-mono); color: var(--text-muted); font-size: 11px; letter-spacing: 0.02em; }

    .side { display: grid; gap: var(--s-3); min-width: 0; }
    .side h3 {
      font-size: 13px; color: var(--text-muted); text-transform: uppercase;
      letter-spacing: 0.08em; font-weight: 600;
    }

    .info-block {
      display: grid; gap: 2px;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .info-block small.muted { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .info-block strong { font-size: 14px; color: var(--text); }
    .info-block small { font-size: 12px; color: var(--text-muted); }

    .customer-list {
      max-height: 260px;
      overflow-y: auto;
      display: grid;
      gap: 4px;
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 4px;
    }
    .cust {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--s-2);
      align-items: center;
      padding: 8px 10px;
      background: transparent;
      border: 0;
      border-radius: var(--r-sm);
      cursor: pointer;
      text-align: left;
      color: var(--text);
      transition: background var(--t-fast);
    }
    .cust:hover { background: var(--bg-hover); }
    .cust--selected { background: var(--accent-soft); }
    .cust__avatar {
      width: 32px; height: 32px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      display: grid; place-items: center;
      font-size: 11px;
      font-weight: 700;
    }
    .cust__info { display: grid; gap: 1px; min-width: 0; }
    .cust__info strong { font-size: 13px; }
    .cust__info small { font-size: 11px; }
    .cust__check { color: var(--accent); font-size: 18px; }

    .new-form { display: grid; gap: var(--s-3); padding: var(--s-3); border: 1px solid var(--border); border-radius: var(--r-md); }
    .form__row { display: grid; gap: var(--s-3); grid-template-columns: 1fr; }
    @media (min-width: 540px) { .form__row { grid-template-columns: 1fr 1fr; } }
    .form__row--actions { justify-content: flex-end; grid-template-columns: auto auto; }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }

    .share-actions {
      display: grid; gap: var(--s-2);
    }
    .share-actions__row {
      display: grid; gap: var(--s-2);
      grid-template-columns: 1fr 1fr;
    }
    @media (max-width: 480px) {
      .share-actions__row { grid-template-columns: 1fr; }
    }

    /* ===== Progreso de pago fraccionado ===== */
    .pay-progress {
      display: grid; gap: 6px;
      padding: var(--s-3);
      background: var(--info-soft);
      border: 1px solid color-mix(in srgb, var(--info) 30%, transparent);
      border-radius: var(--r-md);
    }
    .pay-progress__head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--s-2); }
    .pay-progress__head small { font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; }
    .pay-progress__head strong { font-size: 14px; color: var(--text); font-variant-numeric: tabular-nums; }
    .pay-progress__bar {
      height: 8px;
      background: var(--bg-base);
      border-radius: var(--r-full);
      overflow: hidden;
    }
    .pay-progress__fill {
      height: 100%;
      background: linear-gradient(90deg, var(--info), color-mix(in srgb, var(--info) 70%, var(--accent)));
      border-radius: var(--r-full);
      transition: width var(--t-base);
    }
  `],
})
export class TicketActionsModalComponent {
  private readonly admin = inject(AdminService);
  private readonly raffleSvc = inject(RaffleService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly shareSvc = inject(ShareService);
  private readonly capture = inject(TicketCaptureService);

  readonly open = input<boolean>(false);
  readonly ticket = input<Ticket | null>(null);
  readonly raffle = input.required<Raffle>();
  @Output() close = new EventEmitter<void>();
  @Output() changed = new EventEmitter<Ticket>();

  customers = signal<Customer[]>([]);
  loadingCustomers = signal(false);
  showNewCustomerForm = signal(false);
  creatingCust = signal(false);
  selectedCustomerId = signal<number | null>(null);
  reserving = signal(false);
  releasing = signal(false);
  markingPaid = signal(false);
  error = signal<string | null>(null);

  reportPaymentOpen = signal(false);

  readonly isAdmin = computed(() => {
    const r = this.auth.role();
    return r === 'admin' || r === 'super_admin';
  });

  readonly ticketPrice = computed(() => Number(this.raffle().ticket_price) || 0);

  /** Origin del browser (https://rifas.vercel.app), usado para armar el verify URL. */
  readonly origin = typeof window !== 'undefined' ? window.location.origin : '';

  /** Monto ya pagado (suma de cuotas confirmadas). */
  readonly paidAmount = computed(() => Number(this.ticket()?.paid_amount ?? 0));

  /** Saldo pendiente para completar la boleta. */
  readonly remainingAmount = computed(() => Math.max(this.ticketPrice() - this.paidAmount(), 0));

  /** Porcentaje pagado (0-100), redondeado. */
  readonly paidPct = computed(() => {
    const total = this.ticketPrice();
    if (!total) return 0;
    return Math.min(100, Math.round((this.paidAmount() / total) * 100));
  });

  /** Estado del botón "Extender 24h". */
  extending = signal(false);

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  search = '';
  newCust = { full_name: '', phone: '', document: '' };

  private searchTimer: any;

  readonly modalTitle = computed(() => {
    const t = this.ticket();
    if (!t) return 'Boleta';
    return `Boleta ${t.number_label}`;
  });

  readonly modalSubtitle = computed(() => {
    const t = this.ticket();
    if (!t) return '';
    return `${this.raffle().name} · ${this.statusLabel(t.status)}`;
  });

  readonly secondsToExpire = computed(() => {
    const t = this.ticket();
    if (!t?.reservation_expires_at) return 0;
    const exp = new Date(t.reservation_expires_at).getTime();
    return Math.max(Math.floor((exp - Date.now()) / 1000), 0);
  });

  constructor() {
    // Cuando se abre el modal con una boleta disponible, cargar clientes
    effect(() => {
      if (this.open() && this.ticket()?.status === 'available') {
        this.searchCustomers();
      } else if (!this.open()) {
        // reset al cerrar
        this.error.set(null);
        this.selectedCustomerId.set(null);
        this.showNewCustomerForm.set(false);
        this.search = '';
      }
    });
  }

  // ===== Customer search & creation =====
  searchCustomers() {
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.loadingCustomers.set(true);
      this.admin.listCustomers({ q: this.search || undefined, mine: false }).subscribe({
        next: (cs) => { this.customers.set(cs); this.loadingCustomers.set(false); },
        error: () => this.loadingCustomers.set(false),
      });
    }, 250);
  }

  selectCustomer(id: number) {
    this.selectedCustomerId.set(id);
    this.error.set(null);
  }

  toggleNewForm() {
    this.showNewCustomerForm.update(v => !v);
    this.error.set(null);
  }

  createCustomer() {
    if (!this.newCust.full_name || !this.newCust.phone) {
      this.error.set('Nombre y teléfono son obligatorios');
      return;
    }
    this.creatingCust.set(true);
    this.admin.createCustomer({
      full_name: this.newCust.full_name,
      phone: this.newCust.phone,
      document: this.newCust.document || null,
      email: null, city: null,
    }).subscribe({
      next: (c) => {
        this.customers.update(arr => [c, ...arr]);
        this.selectedCustomerId.set(c.id);
        this.showNewCustomerForm.set(false);
        this.newCust = { full_name: '', phone: '', document: '' };
        this.creatingCust.set(false);
        this.toast.success('Cliente creado', `${c.full_name} fue agregado.`);
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'Error creando cliente';
        this.error.set(detail);
        this.creatingCust.set(false);
        this.toast.error('No se pudo crear el cliente', detail);
      },
    });
  }

  // ===== Actions =====
  reserve() {
    const customerId = this.selectedCustomerId();
    const t = this.ticket();
    if (!customerId || !t) {
      this.error.set('Selecciona un cliente primero');
      return;
    }
    this.reserving.set(true);
    this.error.set(null);
    this.raffleSvc.reserve(t.id, customerId).subscribe({
      next: (updated) => {
        this.reserving.set(false);
        this.changed.emit(updated);
        const customer = this.customers().find(c => c.id === customerId);
        this.toast.success(
          `Boleta ${t.number_label} reservada`,
          customer ? `Asignada a ${customer.full_name}. Tiene 24h para pagar.` : 'Reserva creada.',
        );
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'No se pudo reservar la boleta';
        this.error.set(detail);
        this.reserving.set(false);
        this.toast.error('Error al reservar', detail);
      },
    });
  }

  release() {
    const t = this.ticket();
    if (!t) return;
    const customerName = t.customer?.full_name ?? 'el cliente';

    this.confirmSvc.ask({
      title: `Liberar boleta ${t.number_label}`,
      message: `La reserva de ${customerName} se cancelará y la boleta volverá a estar disponible para otra venta.`,
      tone: 'danger',
      icon: 'lock_open',
      confirmLabel: 'Sí, liberar',
      cancelLabel: 'No, mantener',
    }).subscribe((yes) => {
      if (!yes) return;
      this.releasing.set(true);
      this.error.set(null);
      this.raffleSvc.release(t.id).subscribe({
        next: (updated) => {
          this.releasing.set(false);
          this.changed.emit(updated);
          this.toast.info(`Boleta ${t.number_label} liberada`, 'Ya está disponible para reservar de nuevo.');
        },
        error: (e) => {
          const detail = e?.error?.detail ?? 'No se pudo liberar';
          this.error.set(detail);
          this.releasing.set(false);
          this.toast.error('Error al liberar', detail);
        },
      });
    });
  }

  markPaid() {
    const t = this.ticket();
    if (!t) return;
    const customerName = t.customer?.full_name ?? 'el cliente';

    this.confirmSvc.ask({
      title: `Confirmar pago de la boleta ${t.number_label}`,
      message: `Vas a confirmar la venta a ${customerName}. Esta acción cierra la reserva y registra la comisión.`,
      tone: 'default',
      icon: 'check_circle',
      confirmLabel: 'Sí, marcar pagada',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.markingPaid.set(true);
      this.error.set(null);
      this.raffleSvc.markPaid(t.id).subscribe({
        next: (updated) => {
          this.markingPaid.set(false);
          this.changed.emit(updated);
          this.toast.success(`Boleta ${t.number_label} pagada`, `Venta confirmada a ${customerName}.`);
        },
        error: (e) => {
          const detail = e?.error?.detail ?? 'No se pudo marcar pagada';
          this.error.set(detail);
          this.markingPaid.set(false);
          this.toast.error('Error al marcar pagada', detail);
        },
      });
    });
  }

  downloadingPdf = signal(false);
  downloadingImage = signal(false);
  sharing = signal(false);

  extendReservation() {
    const t = this.ticket();
    if (!t) return;
    this.extending.set(true);
    this.raffleSvc.extendReservation(t.id, 24).subscribe({
      next: (updated) => {
        this.extending.set(false);
        this.changed.emit(updated);
        this.toast.success('Reserva extendida', '24h adicionales. El cliente puede seguir pagando en cuotas.');
      },
      error: (e) => {
        this.extending.set(false);
        const detail = e?.error?.detail ?? 'No se pudo extender la reserva';
        this.toast.error('Error', detail);
      },
    });
  }

  async downloadPdf() {
    const t = this.ticket();
    if (!t) return;
    this.downloadingPdf.set(true);
    try {
      const blob = await this.capture.capturePdf(t, this.raffle());
      this.shareSvc.download(blob, `boleta-${t.code}.pdf`);
      this.toast.success('PDF descargado', `boleta-${t.code}.pdf guardado en tu dispositivo.`);
    } catch {
      this.toast.error('No se pudo descargar', 'Intenta de nuevo.');
    } finally {
      this.downloadingPdf.set(false);
    }
  }

  async downloadImage() {
    const t = this.ticket();
    if (!t) return;
    this.downloadingImage.set(true);
    try {
      const blob = await this.capture.capturePng(t, this.raffle());
      this.shareSvc.download(blob, `boleta-${t.code}.png`);
      this.toast.success(
        'Imagen descargada',
        `boleta-${t.code}.png guardada en tu dispositivo. Adjúntala en WhatsApp si la imagen no se cargó al compartir.`,
      );
    } catch {
      this.toast.error('No se pudo descargar', 'Intenta de nuevo.');
    } finally {
      this.downloadingImage.set(false);
    }
  }

  async shareWhatsApp() {
    const t = this.ticket();
    const r = this.raffle();
    if (!t) return;
    this.sharing.set(true);

    try {
      const blob = await this.capture.capturePng(t, r);
      const text = this.buildWhatsappMessage();
      const result = await this.shareSvc.shareImage(blob, `boleta-${t.code}.png`, {
        title: `Boleta ${t.number_label}`,
        text,
        fallbackWhatsAppText: text,
        toPhone: t.customer?.phone || undefined,
      });
      switch (result) {
        case 'native':
          this.toast.success(
            'Manda la imagen, luego vuelve atrás',
            'Cuando regreses al navegador, WhatsApp se abre solo con el mensaje listo para enviar.',
          );
          break;
        case 'clipboard':
          this.toast.success(
            'Imagen copiada al portapapeles',
            'WhatsApp Web se abrió con el mensaje. Pega la imagen con Ctrl+V en el chat.',
          );
          break;
        case 'download':
          this.toast.info(
            'Imagen descargada',
            'Adjúntala manualmente en el chat de WhatsApp que se abrió. El mensaje ya está pre-cargado.',
          );
          break;
        case 'cancelled':
          // Usuario canceló el share nativo — no decimos nada.
          break;
      }
    } catch {
      this.toast.error('No se pudo generar la imagen', 'Intenta de nuevo.');
    } finally {
      this.sharing.set(false);
    }
  }

  /**
   * Construye el mensaje completo de WhatsApp con: encabezado según estado,
   * números asignados, sorteos en los que participa (1 por premio × N números),
   * total de oportunidades, contacto del vendedor y del responsable, y URL de
   * verificación pública. Diseñado para que cualquier persona, sin importar
   * el nivel educativo, entienda exactamente qué tiene en sus manos.
   */
  private buildWhatsappMessage(): string {
    const t = this.ticket()!;
    const r = this.raffle();
    const firstName = (t.customer?.full_name ?? '').split(' ')[0] || 'Hola';
    const verifyUrl = `${window.location.origin}/verify/${t.code}`;

    const status = t.status;
    let header = '';
    if (status === 'paid' || status === 'winning') {
      header = '✅ *BOLETA PAGADA Y CONFIRMADA*';
    } else if (status === 'partially_paid') {
      header = '🟦 *BOLETA RESERVADA — Pago parcial registrado*';
    } else {
      header = '🎟️ *TU BOLETA QUEDÓ RESERVADA*';
    }

    // Los números van en la IMAGEN adjunta, no en el texto, para evitar
    // duplicación y mantener el mensaje legible.
    const numCount = t.numbers.length;

    // Sorteos: 1 sorteo por premio × N números de la boleta
    const prizes = [...(r.prizes ?? [])].sort((a, b) => a.position - b.position);
    const perTicket = r.numbers_per_ticket || numCount;
    const sorteosLines = prizes.map((p) => {
      const date = this.formatDate(p.draw_date);
      return `✅ ${perTicket} números para ganar el *${p.name}* — sorteo ${date}`;
    });
    const totalOps = perTicket * prizes.length;

    // Contactos: vendedor (quien reservó) + responsable de la rifa
    const sellerName = t.seller?.full_name ?? '';
    const sellerPhone = t.seller?.phone ?? '';
    const respName = r.responsible_name ?? '';
    const respPhone = r.responsible_phone ?? '';

    const contactLines: string[] = [];
    if (sellerName) {
      contactLines.push(
        sellerPhone
          ? `🧑‍💼 *Vendedor:* ${sellerName} — ${sellerPhone}`
          : `🧑‍💼 *Vendedor:* ${sellerName}`,
      );
    }
    if (respName) {
      contactLines.push(
        respPhone
          ? `📞 *Responsable de la rifa:* ${respName} — ${respPhone}`
          : `📞 *Responsable de la rifa:* ${respName}`,
      );
    }

    // Armado final
    return [
      header,
      '',
      `Hola *${firstName}*, esta es tu boleta oficial de la rifa *"${r.name}"*.`,
      '',
      `🎫 *Boleta N° ${t.number_label}*`,
      `🔐 Código: ${t.code}`,
      '',
      `📸 Tus *${numCount} números asignados* están en la imagen adjunta.`,
      '',
      `🏆 *Con esta boleta participas en TODOS los sorteos:*`,
      ...sorteosLines,
      '',
      `🎯 En total tienes *${totalOps} oportunidades de ganar* con esta sola boleta.`,
      ...(contactLines.length ? ['', ...contactLines] : []),
      '',
      `✅ Verifica que tu boleta es auténtica aquí:`,
      verifyUrl,
    ].join('\n');
  }

  /** Convierte "2026-07-01" → "01 jul 2026" (siempre legible en español). */
  private formatDate(iso: string): string {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00');
    if (isNaN(d.getTime())) return iso;
    const day = String(d.getDate()).padStart(2, '0');
    const months = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic'];
    return `${day} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  onClose() { this.close.emit(); }

  openReportPayment() { this.reportPaymentOpen.set(true); }

  onPaymentSubmitted(updatedTicket: Ticket) {
    this.reportPaymentOpen.set(false);
    this.changed.emit(updatedTicket);
  }

  // ===== Helpers =====
  initials(name: string): string {
    return name.trim().split(/\s+/).slice(0, 2).map(p => p[0].toUpperCase()).join('');
  }

  statusLabel(s: string): string {
    return ({
      available: 'Disponible',
      reserved: 'Reservada',
      pending_payment: 'Pendiente pago',
      partially_paid: 'Pago parcial',
      paid: 'Pagada',
      expired: 'Expirada',
      winning: 'Ganadora',
    } as Record<string, string>)[s] ?? s;
  }

  statusTone(s: string): any {
    return s;
  }
}
