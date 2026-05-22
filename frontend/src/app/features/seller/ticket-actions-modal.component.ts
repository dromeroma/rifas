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

            <!-- ========= RESERVADA o PENDING PAYMENT: ver detalle + acciones ========= -->
            @else if (t.status === 'reserved' || t.status === 'pending_payment') {
              <h3>{{ t.status === 'reserved' ? 'Reservada' : 'Pendiente de confirmación' }}</h3>

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
                </div>
              }
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
                <app-button variant="secondary" icon="download" [loading]="downloadingPdf()" [full]="true" (click)="downloadPdf()">
                  {{ downloadingPdf() ? 'Descargando...' : 'Descargar PDF' }}
                </app-button>
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

        @if (ticket()?.status === 'reserved' || ticket()?.status === 'pending_payment') {
          <app-button variant="danger" icon="lock_open" [loading]="releasing()" (click)="release()">
            {{ releasing() ? 'Liberando...' : 'Liberar' }}
          </app-button>

          @if (ticket()?.status === 'reserved') {
            <app-button variant="primary" icon="cloud_upload" (click)="openReportPayment()">
              Reportar pago
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
      [defaultAmount]="ticketPrice()"
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
  sharing = signal(false);

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

  async shareWhatsApp() {
    const t = this.ticket();
    const r = this.raffle();
    if (!t) return;
    this.sharing.set(true);

    try {
      const blob = await this.capture.capturePng(t, r);
      const customer = t.customer?.full_name ?? '';
      const paidLine = t.status === 'paid' || t.status === 'winning' ? '✅ PAGADA · ' : '';
      const verifyUrl = `${window.location.origin}/verify/${t.code}`;
      const text = `${paidLine}Boleta ${t.number_label} de "${r.name}"${customer ? ' · ' + customer : ''}\nVerifica autenticidad: ${verifyUrl}`;

      const usedNative = await this.shareSvc.shareImage(blob, `boleta-${t.code}.png`, {
        title: `Boleta ${t.number_label}`,
        text,
        fallbackWhatsAppText: text,
      });
      if (usedNative) {
        this.toast.success('Boleta compartida', 'Elige a quién enviársela.');
      } else {
        this.toast.info('Imagen descargada', 'Adjúntala en WhatsApp donde se abrió la conversación.');
      }
    } catch {
      this.toast.error('No se pudo generar la imagen', 'Intenta de nuevo.');
    } finally {
      this.sharing.set(false);
    }
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
      paid: 'Pagada',
      expired: 'Expirada',
      winning: 'Ganadora',
    } as Record<string, string>)[s] ?? s;
  }

  statusTone(s: string): any {
    return s;
  }
}
