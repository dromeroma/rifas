import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PaymentListItem, PaymentStatus } from '@core/models/payment.model';
import { ConfirmService } from '@core/services/confirm.service';
import { PaymentService } from '@core/services/payment.service';
import { RaffleService } from '@core/services/raffle.service';
import { ShareService } from '@core/services/share.service';
import { ToastService } from '@core/services/toast.service';
import {
  ButtonComponent, ChipComponent, EmptyComponent, ModalComponent,
} from '@shared/ui';

@Component({
  selector: 'app-payments',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, ChipComponent, EmptyComponent, ModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Pagos</h1>
          <p class="muted">Confirma o rechaza los comprobantes reportados por los vendedores.</p>
        </div>
        <div class="filters">
          <select [(ngModel)]="statusFilter" (change)="refresh()">
            <option value="pending">Pendientes</option>
            <option value="confirmed">Confirmados</option>
            <option value="rejected">Rechazados</option>
            <option value="">Todos</option>
          </select>
        </div>
      </header>

      @if (loading()) {
        <p class="muted">Cargando...</p>
      } @else if (!list().length) {
        <app-empty icon="payments" title="Sin pagos" [description]="emptyDescription()" />
      } @else {
        <div class="cards">
          @for (p of list(); track p.id) {
            <article class="card">
              <header class="card__head">
                <div>
                  <strong class="card__title">Boleta {{ p.ticket_label }}</strong>
                  <small class="muted">{{ p.raffle_name }}</small>
                </div>
                <app-chip [tone]="statusTone(p.status)">{{ statusLabel(p.status) }}</app-chip>
              </header>

              <div class="card__grid">
                <div class="cell">
                  <small class="muted">Cliente</small>
                  <strong>{{ p.customer_name }}</strong>
                  <small class="muted">{{ p.customer_phone }}</small>
                </div>
                <div class="cell">
                  <small class="muted">Vendedor</small>
                  <strong>{{ p.seller_name ?? '—' }}</strong>
                </div>
                <div class="cell">
                  <small class="muted">Método</small>
                  <strong>{{ methodLabel(p.method) }}</strong>
                </div>
                <div class="cell">
                  <small class="muted">Monto</small>
                  <strong class="amount">{{ '$' + fmt(p.amount) }}</strong>
                </div>
                @if (p.reference) {
                  <div class="cell">
                    <small class="muted">Referencia</small>
                    <strong class="mono">{{ p.reference }}</strong>
                  </div>
                }
                <div class="cell">
                  <small class="muted">Reportado</small>
                  <strong>{{ p.created_at | date:'short' }}</strong>
                </div>
              </div>

              @if (p.notes) {
                <div class="notes">
                  <span class="material-icons">notes</span>
                  <span>{{ p.notes }}</span>
                </div>
              }

              @if (p.status === 'rejected' && p.rejection_reason) {
                <div class="rejection">
                  <span class="material-icons">cancel</span>
                  <span><strong>Rechazado:</strong> {{ p.rejection_reason }}</span>
                </div>
              }

              <div class="card__actions">
                @if (p.proof_url) {
                  <app-button variant="secondary" icon="visibility" (click)="viewProof(p)">
                    Ver comprobante
                  </app-button>
                } @else {
                  <small class="muted">Sin comprobante adjunto</small>
                }

                @if (p.status === 'pending') {
                  <app-button variant="danger" icon="close" (click)="askReject(p)">
                    Rechazar
                  </app-button>
                  <app-button variant="primary" icon="check_circle" (click)="askConfirm(p)">
                    Confirmar pago
                  </app-button>
                }

                @if (p.status === 'confirmed') {
                  <app-button variant="primary" icon="send"
                              [loading]="isSendingTo(p.id)"
                              (click)="sendBoletaToCustomer(p)">
                    Enviar boleta al cliente
                  </app-button>
                }
              </div>
            </article>
          }
        </div>
      }
    </div>

    <!-- Modal Ver comprobante -->
    <app-modal
      [open]="proofOpen()"
      [title]="'Comprobante · Boleta ' + (proofPayment()?.ticket_label ?? '')"
      size="md"
      (close)="closeProof()"
    >
      @if (proofLoading()) {
        <p class="muted">Cargando comprobante...</p>
      } @else if (proofError()) {
        <div class="alert">
          <span class="material-icons">error_outline</span>{{ proofError() }}
        </div>
      } @else if (proofUrl(); as url) {
        @if (proofIsPdf()) {
          <iframe class="proof-frame" [src]="safeProofUrl()"></iframe>
        } @else {
          <img class="proof-img" [src]="url" alt="comprobante de pago" />
        }
      }
      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closeProof()">Cerrar</app-button>
      </ng-container>
    </app-modal>

    <!-- Modal Rechazar (input de razón) -->
    <app-modal
      [open]="rejectOpen()"
      title="Rechazar pago"
      [subtitle]="'Boleta ' + (rejectPayment()?.ticket_label ?? '') + ' · ' + (rejectPayment()?.customer_name ?? '')"
      size="sm"
      (close)="closeReject()"
    >
      <p class="muted">
        Indica el motivo del rechazo. El cliente y el vendedor podrán verlo. La boleta volverá a estar reservada.
      </p>
      <label class="reject-field">
        <span>Motivo del rechazo</span>
        <textarea rows="3" [(ngModel)]="rejectReason" name="reason"
                  placeholder="Ej: comprobante ilegible, monto incorrecto, transacción no encontrada..."></textarea>
      </label>
      @if (rejectError()) { <div class="alert">{{ rejectError() }}</div> }
      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closeReject()">Cancelar</app-button>
        <app-button variant="danger" icon="close" [loading]="rejecting()" (click)="doReject()">
          {{ rejecting() ? 'Rechazando...' : 'Rechazar pago' }}
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; }
    .page__head h1 { font-size: 22px; }
    .filters select {
      height: var(--h-input);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      color: var(--text);
      padding: 0 var(--s-3);
      border-radius: var(--r-md);
      font-size: 14px;
    }

    .cards { display: grid; gap: var(--s-3); }
    @media (min-width: 900px) { .cards { grid-template-columns: 1fr 1fr; } }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid;
      gap: var(--s-3);
    }
    .card__head { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
    .card__title { display: block; font-size: 15px; color: var(--text); }
    .card__head small { font-size: 12px; color: var(--text-muted); }

    .card__grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: var(--s-2);
    }
    @media (min-width: 540px) { .card__grid { grid-template-columns: repeat(3, 1fr); } }
    .cell { display: grid; gap: 2px; min-width: 0; }
    .cell small.muted { font-size: 10px; letter-spacing: 0.08em; text-transform: uppercase; }
    .cell strong { font-size: 13px; color: var(--text); }
    .cell .amount { color: var(--accent); font-size: 16px; }
    .cell .mono { font-family: var(--font-mono); font-size: 12px; }

    .notes, .rejection {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 10px 12px;
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .notes { background: var(--bg-base); color: var(--text-muted); }
    .notes .material-icons { font-size: 18px; color: var(--text-faint); margin-top: 2px; }
    .rejection { background: var(--danger-soft); color: var(--danger); }
    .rejection .material-icons { font-size: 18px; margin-top: 2px; }

    .card__actions {
      display: flex; gap: var(--s-2); flex-wrap: wrap;
      justify-content: flex-end;
      border-top: 1px solid var(--border);
      padding-top: var(--s-3);
    }

    .proof-img {
      max-width: 100%;
      max-height: 70dvh;
      border-radius: var(--r-md);
      display: block;
      margin: 0 auto;
    }
    .proof-frame {
      width: 100%;
      height: 70dvh;
      border: 0;
      border-radius: var(--r-md);
      background: #fff;
    }

    .reject-field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); margin-top: var(--s-3); }
    .reject-field textarea {
      padding: 10px 12px;
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid transparent;
      border-radius: var(--r-md);
      font-family: inherit;
      font-size: 14px;
      resize: vertical;
    }
    .reject-field textarea:focus { outline: 0; border-color: var(--accent); }

    .alert {
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class PaymentsComponent implements OnInit {
  private readonly paymentSvc = inject(PaymentService);
  private readonly raffleSvc = inject(RaffleService);
  private readonly shareSvc = inject(ShareService);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  /** Set de payment.id en proceso de envío. */
  sendingTo = signal<Set<number>>(new Set());

  loading = signal(true);
  list = signal<PaymentListItem[]>([]);
  statusFilter: PaymentStatus | '' = 'pending';

  readonly emptyDescription = computed(() => {
    if (this.statusFilter === 'pending') return 'No hay pagos pendientes de revisión.';
    if (this.statusFilter === 'confirmed') return 'Aún no hay pagos confirmados.';
    if (this.statusFilter === 'rejected') return 'No hay pagos rechazados.';
    return 'Aún no se han reportado pagos.';
  });

  // Ver comprobante
  proofOpen = signal(false);
  proofLoading = signal(false);
  proofError = signal<string | null>(null);
  proofPayment = signal<PaymentListItem | null>(null);
  proofUrl = signal<string | null>(null);
  proofIsPdf = signal(false);
  private currentObjectUrl: string | null = null;

  // Para iframes con blob: URLs, Angular pide sanitización. Aquí lo dejamos como url plana (el blob es local).
  safeProofUrl = computed(() => this.proofUrl());

  // Rechazar
  rejectOpen = signal(false);
  rejectPayment = signal<PaymentListItem | null>(null);
  rejecting = signal(false);
  rejectReason = '';
  rejectError = signal<string | null>(null);

  ngOnInit(): void { this.refresh(); }

  refresh() {
    this.loading.set(true);
    const filter = this.statusFilter || undefined;
    this.paymentSvc.list(filter).subscribe({
      next: (r) => { this.list.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  viewProof(p: PaymentListItem) {
    this.proofPayment.set(p);
    this.proofOpen.set(true);
    this.proofLoading.set(true);
    this.proofError.set(null);
    this.proofUrl.set(null);
    this.proofIsPdf.set(false);

    this.paymentSvc.proof(p.id).subscribe({
      next: (blob) => {
        if (this.currentObjectUrl) URL.revokeObjectURL(this.currentObjectUrl);
        this.currentObjectUrl = URL.createObjectURL(blob);
        this.proofUrl.set(this.currentObjectUrl);
        this.proofIsPdf.set(blob.type === 'application/pdf');
        this.proofLoading.set(false);
      },
      error: (e) => {
        this.proofError.set(e?.error?.detail ?? 'No se pudo cargar el comprobante');
        this.proofLoading.set(false);
      },
    });
  }

  closeProof() {
    this.proofOpen.set(false);
    if (this.currentObjectUrl) {
      URL.revokeObjectURL(this.currentObjectUrl);
      this.currentObjectUrl = null;
    }
    this.proofUrl.set(null);
  }

  askConfirm(p: PaymentListItem) {
    this.confirmSvc.ask({
      title: `Confirmar pago de la boleta ${p.ticket_label}`,
      message: `Vas a confirmar la venta a ${p.customer_name} por $${this.fmt(p.amount)}. Se generará la comisión del vendedor automáticamente.`,
      icon: 'check_circle',
      confirmLabel: 'Sí, confirmar',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.paymentSvc.confirm(p.id).subscribe({
        next: () => {
          this.toast.success(
            'Pago confirmado',
            `Boleta ${p.ticket_label} pagada. Comisión generada para ${p.seller_name ?? 'el vendedor'}.`,
          );
          this.refresh();
        },
        error: (e) => {
          this.toast.error('No se pudo confirmar', e?.error?.detail ?? 'Intenta de nuevo.');
        },
      });
    });
  }

  askReject(p: PaymentListItem) {
    this.rejectPayment.set(p);
    this.rejectReason = '';
    this.rejectError.set(null);
    this.rejectOpen.set(true);
  }

  closeReject() {
    this.rejectOpen.set(false);
    this.rejectPayment.set(null);
  }

  sendBoletaToCustomer(p: PaymentListItem) {
    // Descarga la imagen de la boleta y abre WhatsApp con el teléfono del cliente.
    const set = new Set(this.sendingTo());
    set.add(p.id);
    this.sendingTo.set(set);

    this.raffleSvc.ticketImage(p.ticket_id).subscribe({
      next: async (blob) => {
        const verifyUrl = `${window.location.origin}/verify/${p.ticket_code}`;
        const text =
          `✅ Pago confirmado · Boleta ${p.ticket_label} de "${p.raffle_name}"\n` +
          `Hola ${p.customer_name.split(' ')[0]}, te enviamos tu boleta oficial.\n` +
          `Verifica autenticidad en cualquier momento: ${verifyUrl}`;

        await this.shareSvc.shareImage(blob, `boleta-${p.ticket_code}.png`, {
          title: `Boleta ${p.ticket_label}`,
          text,
          fallbackWhatsAppText: text,
          toPhone: p.customer_phone,
        });
        const after = new Set(this.sendingTo());
        after.delete(p.id);
        this.sendingTo.set(after);
        this.toast.success('Boleta lista para enviar', 'Adjunta la imagen descargada en el chat de WhatsApp que se abrió.');
      },
      error: () => {
        const after = new Set(this.sendingTo());
        after.delete(p.id);
        this.sendingTo.set(after);
        this.toast.error('No se pudo generar la boleta', 'Intenta de nuevo.');
      },
    });
  }

  isSendingTo(id: number) { return this.sendingTo().has(id); }

  doReject() {
    const p = this.rejectPayment();
    if (!p) return;
    if (this.rejectReason.trim().length < 3) {
      this.rejectError.set('Indica un motivo (mínimo 3 caracteres).');
      return;
    }
    this.rejecting.set(true);
    this.paymentSvc.reject(p.id, this.rejectReason.trim()).subscribe({
      next: () => {
        this.rejecting.set(false);
        this.closeReject();
        this.toast.info(
          'Pago rechazado',
          `Boleta ${p.ticket_label} volvió a reservada. El vendedor podrá reportar el pago nuevamente.`,
        );
        this.refresh();
      },
      error: (e) => {
        this.rejecting.set(false);
        this.rejectError.set(e?.error?.detail ?? 'No se pudo rechazar');
      },
    });
  }

  statusLabel(s: PaymentStatus) {
    return ({ pending: 'Pendiente', confirmed: 'Confirmado', rejected: 'Rechazado' })[s];
  }
  statusTone(s: PaymentStatus): any {
    return s === 'confirmed' ? 'accent' : s === 'rejected' ? 'danger' : 'warning';
  }
  methodLabel(m: string) {
    return ({
      nequi: 'Nequi', daviplata: 'Daviplata',
      bank_transfer: 'Transferencia', qr: 'QR', cash: 'Efectivo',
    } as Record<string, string>)[m] ?? m;
  }
  fmt(v: number) {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }
}
