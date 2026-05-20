import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Raffle } from '@core/models/raffle.model';
import { ConfirmService } from '@core/services/confirm.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';
import {
  ButtonComponent, InputComponent, ModalComponent,
} from '@shared/ui';

interface PrizeForm {
  position: number;
  name: string;
  draw_date: string;
  estimated_value: number | null;
  description: string;
}

@Component({
  selector: 'app-raffle-create-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, ModalComponent,
  ],
  template: `
    <app-modal
      [open]="open()"
      title="Crear nueva rifa"
      subtitle="Configura los datos básicos, premios y responsable."
      size="lg"
      (close)="onClose()"
    >
      <form class="form">

        <!-- ============ INFORMACIÓN BÁSICA ============ -->
        <section class="section">
          <h3>Información básica</h3>
          <app-input label="Nombre de la rifa *" [(ngModel)]="form.name" name="name"
                      icon="title" hint="Ej: Gran Rifa del Televisor 50''" />
          <div class="row">
            <app-input label="Fecha del sorteo final *" type="date"
                        [(ngModel)]="form.final_draw_date" name="final_draw_date" icon="event" />
            <app-input label="Lotería con la que juega"
                        [(ngModel)]="form.lottery_name" name="lottery_name"
                        icon="casino" hint="Ej: Lotería de Bogotá" />
          </div>
          <label class="textarea-field">
            <span>Descripción (opcional)</span>
            <textarea rows="2" [(ngModel)]="form.description" name="description"
                      placeholder="Breve descripción visible para clientes..."></textarea>
          </label>
          <app-input label="Color primario (HEX)"
                      [(ngModel)]="form.primary_color" name="primary_color"
                      icon="palette" hint="Color del pasto de la boleta. Ej: #1e8e54" />
        </section>

        <!-- ============ CONFIGURACIÓN MATEMÁTICA ============ -->
        <section class="section">
          <h3>Configuración de boletas</h3>
          <p class="muted hint">
            Total de boletas × números por boleta debe igualar el rango (max − min + 1).
            <strong>Esta configuración no se puede cambiar después de generar números.</strong>
          </p>
          <div class="row row--3">
            <app-input label="Total boletas *" type="number" inputmode="numeric"
                        [(ngModel)]="form.total_tickets" name="total_tickets" icon="confirmation_number" />
            <app-input label="Números por boleta *" type="number" inputmode="numeric"
                        [(ngModel)]="form.numbers_per_ticket" name="numbers_per_ticket" icon="tag" />
            <app-input label="Dígitos por número *" type="number" inputmode="numeric"
                        [(ngModel)]="form.number_digits" name="number_digits"
                        icon="123" hint="Ej: 4 → 0421" />
          </div>
          <div class="row">
            <app-input label="Número mínimo *" type="number" inputmode="numeric"
                        [(ngModel)]="form.number_min" name="number_min" icon="arrow_downward" />
            <app-input label="Número máximo *" type="number" inputmode="numeric"
                        [(ngModel)]="form.number_max" name="number_max" icon="arrow_upward" />
          </div>

          <div class="math-check" [class.math-check--ok]="mathValid()" [class.math-check--err]="!mathValid()">
            @if (mathValid()) {
              ✓ Matemática consistente: {{ form.total_tickets }} × {{ form.numbers_per_ticket }} = {{ rangeSize() }} números ({{ form.number_min }} a {{ form.number_max }})
            } @else {
              ⚠ Inconsistencia: {{ form.total_tickets }} × {{ form.numbers_per_ticket }} = {{ form.total_tickets * form.numbers_per_ticket }} pero el rango es {{ rangeSize() }}
            }
          </div>

          <div class="row">
            <app-input label="Precio por boleta (COP) *" type="number" inputmode="numeric"
                        [(ngModel)]="form.ticket_price" name="ticket_price" icon="payments" />
            <app-input label="Comisión vendedor por boleta (COP)" type="number" inputmode="numeric"
                        [(ngModel)]="form.seller_commission" name="seller_commission" icon="redeem" />
          </div>
        </section>

        <!-- ============ RESPONSABLE ============ -->
        <section class="section">
          <h3>Responsable de la rifa</h3>
          <p class="muted hint">Estos datos aparecen en la boleta compartida y en el verify público.</p>
          <app-input label="Nombre del responsable"
                      [(ngModel)]="form.responsible_name" name="responsible_name" icon="person" />
          <div class="row">
            <app-input label="Teléfono de contacto"
                        [(ngModel)]="form.responsible_phone" name="responsible_phone"
                        icon="phone" inputmode="tel" />
            <app-input label="Email de contacto" type="email"
                        [(ngModel)]="form.responsible_email" name="responsible_email" icon="alternate_email" />
          </div>
        </section>

        <!-- ============ PREMIOS ============ -->
        <section class="section">
          <div class="section__head">
            <h3>Premios y fechas de sorteo</h3>
            <app-button variant="secondary" size="sm" icon="add" (click)="addPrize()">
              Agregar premio
            </app-button>
          </div>
          @if (!form.prizes.length) {
            <p class="muted hint">Aún no hay premios. Agrega al menos uno antes de crear la rifa.</p>
          }
          @for (p of form.prizes; track $index; let i = $index) {
            <div class="prize-card">
              <div class="prize-card__head">
                <strong>Premio #{{ p.position }}</strong>
                <button type="button" class="del-btn" (click)="removePrize(i)" aria-label="Eliminar">
                  <span class="material-icons">close</span>
                </button>
              </div>
              <div class="row">
                <app-input label="Nombre del premio *"
                            [(ngModel)]="p.name" [name]="'prize_name_' + i" icon="emoji_events" />
                <app-input label="Fecha de sorteo *" type="date"
                            [(ngModel)]="p.draw_date" [name]="'prize_date_' + i" icon="event" />
              </div>
              <div class="row">
                <app-input label="Valor estimado (COP)" type="number" inputmode="numeric"
                            [(ngModel)]="p.estimated_value" [name]="'prize_value_' + i" icon="payments" />
                <app-input label="Descripción"
                            [(ngModel)]="p.description" [name]="'prize_desc_' + i" icon="notes" />
              </div>
            </div>
          }
        </section>

        <!-- ============ TÉRMINOS ============ -->
        <section class="section">
          <h3>Términos (opcional)</h3>
          <label class="textarea-field">
            <span>Reglas, restricciones, política de cancelación...</span>
            <textarea rows="3" [(ngModel)]="form.terms" name="terms"
                      placeholder="Sorteo asociado a los resultados de la lotería..."></textarea>
          </label>
        </section>

        @if (error()) {
          <div class="alert">
            <span class="material-icons">error_outline</span>{{ error() }}
          </div>
        }
      </form>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="onClose()">Cancelar</app-button>
        <app-button variant="primary" icon="check" [loading]="saving()" (click)="submit()">
          {{ saving() ? 'Creando...' : 'Crear rifa' }}
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .form { display: grid; gap: var(--s-5); }
    .section { display: grid; gap: var(--s-3); }
    .section h3 {
      font-size: 13px; color: var(--text-muted); text-transform: uppercase;
      letter-spacing: 0.08em; font-weight: 600; margin: 0;
    }
    .section__head { display: flex; justify-content: space-between; align-items: center; }
    .hint { font-size: 12px; color: var(--text-muted); margin: -4px 0 0; }
    .row { display: grid; gap: var(--s-3); grid-template-columns: 1fr; }
    @media (min-width: 540px) {
      .row { grid-template-columns: repeat(2, 1fr); }
      .row--3 { grid-template-columns: repeat(3, 1fr); }
    }

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

    .math-check {
      padding: 10px 12px;
      border-radius: var(--r-md);
      font-size: 13px;
      font-weight: 500;
    }
    .math-check--ok { background: var(--accent-soft); color: var(--accent); }
    .math-check--err { background: var(--warning-soft); color: var(--warning); }

    .prize-card {
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
      display: grid;
      gap: var(--s-3);
    }
    .prize-card__head {
      display: flex; justify-content: space-between; align-items: center;
    }
    .prize-card__head strong {
      font-size: 13px; color: var(--accent); font-weight: 700;
    }
    .del-btn {
      width: 28px; height: 28px;
      background: transparent; border: 0; border-radius: 50%;
      color: var(--text-faint);
      cursor: pointer;
      display: grid; place-items: center;
    }
    .del-btn:hover { background: var(--danger-soft); color: var(--danger); }
    .del-btn .material-icons { font-size: 16px; }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class RaffleCreateModalComponent {
  private readonly raffleSvc = inject(RaffleService);
  private readonly confirmSvc = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  readonly open = input<boolean>(false);
  @Output() close = new EventEmitter<void>();
  @Output() created = new EventEmitter<Raffle>();

  saving = signal(false);
  error = signal<string | null>(null);

  form: {
    name: string;
    description: string;
    total_tickets: number;
    numbers_per_ticket: number;
    number_min: number;
    number_max: number;
    number_digits: number;
    ticket_price: number;
    seller_commission: number;
    final_draw_date: string;
    primary_color: string;
    lottery_name: string;
    responsible_name: string;
    responsible_phone: string;
    responsible_email: string;
    terms: string;
    prizes: PrizeForm[];
  } = this.blankForm();

  readonly rangeSize = computed(() => this.form.number_max - this.form.number_min + 1);
  readonly mathValid = computed(() => {
    const expected = this.form.total_tickets * this.form.numbers_per_ticket;
    return this.rangeSize() === expected && expected > 0;
  });

  constructor() {
    effect(() => {
      if (this.open()) {
        this.form = this.blankForm();
        this.error.set(null);
      }
    });
  }

  blankForm() {
    const today = new Date();
    const inThreeMonths = new Date(today.getFullYear(), today.getMonth() + 3, today.getDate());
    return {
      name: '',
      description: '',
      total_tickets: 500,
      numbers_per_ticket: 20,
      number_min: 0,
      number_max: 9999,
      number_digits: 4,
      ticket_price: 20000,
      seller_commission: 3000,
      final_draw_date: inThreeMonths.toISOString().slice(0, 10),
      primary_color: '#1e8e54',
      lottery_name: '',
      responsible_name: '',
      responsible_phone: '',
      responsible_email: '',
      terms: '',
      prizes: [],
    };
  }

  addPrize() {
    const today = new Date();
    const next = new Date(today.getFullYear(), today.getMonth() + this.form.prizes.length + 1, today.getDate());
    this.form.prizes.push({
      position: this.form.prizes.length + 1,
      name: '',
      draw_date: next.toISOString().slice(0, 10),
      estimated_value: null,
      description: '',
    });
  }

  removePrize(i: number) {
    this.form.prizes.splice(i, 1);
    // Re-numerar posiciones
    this.form.prizes.forEach((p, idx) => p.position = idx + 1);
  }

  onClose() { this.close.emit(); }

  submit() {
    this.error.set(null);

    // Validaciones
    if (!this.form.name.trim()) {
      this.error.set('El nombre de la rifa es obligatorio.');
      return;
    }
    if (!this.form.final_draw_date) {
      this.error.set('La fecha del sorteo final es obligatoria.');
      return;
    }
    if (!this.form.ticket_price || this.form.ticket_price <= 0) {
      this.error.set('El precio de la boleta debe ser mayor a cero.');
      return;
    }
    if (!this.mathValid()) {
      this.error.set('La matemática no cuadra: revisa total de boletas, números por boleta y el rango.');
      return;
    }
    if (!this.form.prizes.length) {
      this.error.set('Agrega al menos un premio antes de crear la rifa.');
      return;
    }
    for (const p of this.form.prizes) {
      if (!p.name.trim() || !p.draw_date) {
        this.error.set(`Completa nombre y fecha del premio #${p.position}.`);
        return;
      }
    }

    this.confirmSvc.ask({
      title: '¿Crear la rifa?',
      message: `Vas a crear "${this.form.name}" con ${this.form.total_tickets} boletas y ${this.form.prizes.length} premio(s). Podrás editar datos básicos hasta que generes los números (acción irreversible).`,
      icon: 'casino',
      confirmLabel: 'Sí, crear',
      cancelLabel: 'Revisar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.saving.set(true);

      const payload: any = {
        name: this.form.name.trim(),
        description: this.form.description.trim() || undefined,
        total_tickets: Number(this.form.total_tickets),
        numbers_per_ticket: Number(this.form.numbers_per_ticket),
        number_min: Number(this.form.number_min),
        number_max: Number(this.form.number_max),
        number_digits: Number(this.form.number_digits),
        ticket_price: Number(this.form.ticket_price),
        seller_commission: Number(this.form.seller_commission || 0),
        final_draw_date: this.form.final_draw_date,
        primary_color: this.form.primary_color || undefined,
        lottery_name: this.form.lottery_name.trim() || undefined,
        responsible_name: this.form.responsible_name.trim() || undefined,
        responsible_phone: this.form.responsible_phone.trim() || undefined,
        responsible_email: this.form.responsible_email.trim() || undefined,
        terms: this.form.terms.trim() || undefined,
        prizes: this.form.prizes.map(p => ({
          position: p.position,
          name: p.name.trim(),
          draw_date: p.draw_date,
          estimated_value: p.estimated_value != null ? Number(p.estimated_value) : undefined,
          description: p.description.trim() || undefined,
        })),
      };

      this.raffleSvc.create(payload).subscribe({
        next: (raffle) => {
          this.saving.set(false);
          this.toast.success(
            `Rifa "${raffle.name}" creada`,
            'Ahora puedes generar los números desde el detalle de la rifa.',
          );
          this.created.emit(raffle);
          this.close.emit();
        },
        error: (e) => {
          this.saving.set(false);
          const detail = e?.error?.detail;
          // Detail puede ser string o array de errors de Pydantic
          if (Array.isArray(detail)) {
            this.error.set(detail.map((d: any) => `${d.loc?.slice(1).join('.')}: ${d.msg}`).join(' · '));
          } else {
            this.error.set(detail ?? 'No se pudo crear la rifa');
          }
          this.toast.error('Error al crear rifa', this.error() ?? '');
        },
      });
    });
  }
}
