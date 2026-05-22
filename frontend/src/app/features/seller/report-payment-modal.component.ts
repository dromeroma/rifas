import { CommonModule } from '@angular/common';
import {
  Component, EventEmitter, Output, computed, effect, inject, input, signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Ticket } from '@core/models/raffle.model';
import { PaymentMethod } from '@core/models/payment.model';
import { PaymentService } from '@core/services/payment.service';
import { ToastService } from '@core/services/toast.service';
import {
  ButtonComponent, InputComponent, ModalComponent,
} from '@shared/ui';

@Component({
  selector: 'app-report-payment-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, ModalComponent,
  ],
  template: `
    <app-modal
      [open]="open()"
      title="Reportar pago"
      [subtitle]="ticket() ? 'Boleta ' + ticket()!.number_label + ' · ' + (ticket()?.customer?.full_name ?? 'cliente') : ''"
      size="md"
      (close)="close.emit()"
    >
      <form class="form" (ngSubmit)="submit()">
        <p class="muted intro">
          Adjunta el comprobante de pago. El administrador lo revisará y confirmará la venta.
          @if (maxAmount() > 0 && maxAmount() < defaultAmount()) {
            <strong> Saldo pendiente: {{ '$' + fmt(maxAmount()) }}.</strong>
          }
        </p>

        <label class="field">
          <span>Método de pago</span>
          <select [(ngModel)]="form.method" name="method">
            <option value="nequi">Nequi</option>
            <option value="daviplata">Daviplata</option>
            <option value="bank_transfer">Transferencia bancaria</option>
            <option value="qr">QR</option>
            <option value="cash">Efectivo</option>
          </select>
        </label>

        <div class="row">
          <app-input
            label="Monto (COP)"
            type="number"
            inputmode="numeric"
            icon="payments"
            [(ngModel)]="form.amount"
            name="amount"
          />
          <app-input
            label="Referencia / transacción (opcional)"
            icon="tag"
            [(ngModel)]="form.reference"
            name="reference"
          />
        </div>

        <label class="textarea-field">
          <span>Notas (opcional)</span>
          <textarea rows="2" [(ngModel)]="form.notes" name="notes"
                    placeholder="Cualquier detalle relevante del pago..."></textarea>
        </label>

        <div class="upload">
          <label class="upload__label">
            <span class="material-icons">attach_file</span>
            <div>
              <strong>Adjuntar comprobante</strong>
              <small class="muted">Foto (JPG/PNG) o PDF — max 10 MB</small>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp,application/pdf"
              (change)="onFileSelected($event)"
              hidden
            />
          </label>
          @if (selectedFile()) {
            <div class="upload__preview">
              <span class="material-icons">{{ filePreviewIcon() }}</span>
              <div>
                <strong>{{ selectedFile()!.name }}</strong>
                <small class="muted">{{ fileSizeKb() }} KB</small>
              </div>
              <button type="button" class="icon-btn" (click)="clearFile()" aria-label="Quitar">
                <span class="material-icons">close</span>
              </button>
            </div>
          }
        </div>

        @if (error()) {
          <div class="alert">
            <span class="material-icons">error_outline</span>{{ error() }}
          </div>
        }
      </form>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="close.emit()">Cancelar</app-button>
        <app-button variant="primary" icon="cloud_upload" [loading]="saving()" (click)="submit()">
          {{ saving() ? 'Enviando...' : 'Reportar pago' }}
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .form { display: grid; gap: var(--s-3); }
    .intro { font-size: 13px; }

    .field { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .field span { font-weight: 500; }
    select {
      height: var(--h-input);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      padding: 0 var(--s-3);
      border-radius: var(--r-md);
      font-size: 14px;
    }
    select:focus { outline: 0; border-color: var(--accent); }

    .row { display: grid; gap: var(--s-3); grid-template-columns: 1fr; }
    @media (min-width: 540px) { .row { grid-template-columns: 1fr 1fr; } }

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

    .upload { display: grid; gap: var(--s-2); }
    .upload__label {
      display: flex; align-items: center; gap: var(--s-3);
      padding: var(--s-4);
      background: var(--bg-input);
      border: 2px dashed var(--border-strong);
      border-radius: var(--r-md);
      cursor: pointer;
      transition: border-color var(--t-fast), background var(--t-fast);
    }
    .upload__label:hover { border-color: var(--accent); background: var(--accent-soft); }
    .upload__label .material-icons { font-size: 28px; color: var(--text-muted); }
    .upload__label strong { display: block; font-size: 14px; color: var(--text); }
    .upload__label small { font-size: 12px; }

    .upload__preview {
      display: flex; align-items: center; gap: var(--s-3);
      padding: var(--s-3);
      background: var(--accent-soft);
      border: 1px solid var(--accent);
      border-radius: var(--r-md);
    }
    .upload__preview .material-icons { color: var(--accent); }
    .upload__preview strong { display: block; font-size: 13px; }
    .upload__preview > div { flex: 1; min-width: 0; }
    .upload__preview strong { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .icon-btn {
      width: 32px; height: 32px;
      background: transparent; border: 0;
      border-radius: 50%;
      color: var(--text-muted);
      cursor: pointer;
    }
    .icon-btn:hover { background: var(--bg-hover); color: var(--danger); }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class ReportPaymentModalComponent {
  private readonly paymentSvc = inject(PaymentService);
  private readonly toast = inject(ToastService);

  readonly open = input<boolean>(false);
  readonly ticket = input<Ticket | null>(null);
  readonly defaultAmount = input<number>(0);
  /** Tope superior aceptado. Si el ticket tiene pagos parciales, equivale al saldo pendiente. */
  readonly maxAmount = input<number>(0);

  @Output() close = new EventEmitter<void>();
  @Output() submitted = new EventEmitter<Ticket>();

  form: {
    method: PaymentMethod;
    amount: number;
    reference: string;
    notes: string;
  } = {
    method: 'nequi',
    amount: 0,
    reference: '',
    notes: '',
  };

  selectedFile = signal<File | null>(null);
  saving = signal(false);
  error = signal<string | null>(null);

  readonly filePreviewIcon = computed(() => {
    const f = this.selectedFile();
    if (!f) return 'attach_file';
    return f.type === 'application/pdf' ? 'picture_as_pdf' : 'image';
  });

  readonly fileSizeKb = computed(() => {
    const f = this.selectedFile();
    return f ? Math.round(f.size / 1024) : 0;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        // Inicializar el monto con el precio sugerido cuando se abra
        this.form = {
          method: 'nequi',
          amount: this.defaultAmount() || 0,
          reference: '',
          notes: '',
        };
        this.selectedFile.set(null);
        this.error.set(null);
      }
    });
  }

  onFileSelected(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    if (file && file.size > 10 * 1024 * 1024) {
      this.error.set('El archivo supera los 10 MB.');
      this.selectedFile.set(null);
      return;
    }
    this.selectedFile.set(file);
    this.error.set(null);
  }

  clearFile() {
    this.selectedFile.set(null);
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }

  submit() {
    const t = this.ticket();
    if (!t) return;
    if (!this.form.amount || this.form.amount <= 0) {
      this.error.set('El monto debe ser mayor a cero.');
      return;
    }
    const max = this.maxAmount();
    if (max > 0 && this.form.amount > max) {
      this.error.set(`El monto supera el saldo pendiente ($${this.fmt(max)}).`);
      return;
    }
    if (!this.selectedFile()) {
      this.error.set('Adjunta el comprobante (foto o PDF) del pago.');
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    this.paymentSvc.submit(t.id, {
      method: this.form.method,
      amount: this.form.amount,
      reference: this.form.reference || undefined,
      notes: this.form.notes || undefined,
      proof: this.selectedFile(),
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.toast.success(
          `Pago reportado · Boleta ${t.number_label}`,
          'El administrador revisará el comprobante.',
        );
        this.submitted.emit({ ...t, status: 'pending_payment' });
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'No se pudo reportar el pago';
        this.error.set(detail);
        this.saving.set(false);
        this.toast.error('Error al reportar pago', detail);
      },
    });
  }
}
