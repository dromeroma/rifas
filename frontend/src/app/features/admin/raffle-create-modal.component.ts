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

interface TierForm {
  from_count: number;
  to_count: number | null;
  amount_per_ticket: number;
}

interface PackageOption {
  size: number;
  price: number;
}

type RaffleModeKey = 'classic' | 'package' | 'express' | 'custom';

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
      icon="casino"
      size="lg"
      (close)="onClose()"
    >
      <form class="form">

        <!-- ============ TEMPLATE / MODALIDAD ============ -->
        <section class="section">
          <h3>Modalidad de la rifa</h3>
          <p class="muted hint">
            Empieza eligiendo el tipo de rifa. Pre-llenamos los valores típicos
            según el caso; siempre puedes ajustarlos.
          </p>
          <div class="tpl-grid">
            <button type="button" class="tpl" [class.tpl--active]="form.template === 'classic'"
                    (click)="applyTemplate('classic')">
              <span class="tpl__icon">🎟️</span>
              <strong>Clásica</strong>
              <small>500 boletas × 20 números (4 dígitos). Vendes la boleta como unidad.</small>
              <small class="tpl__use">Ej: TV, electrodomésticos, viajes.</small>
            </button>

            <button type="button" class="tpl" [class.tpl--active]="form.template === 'package'"
                    (click)="applyTemplate('package')">
              <span class="tpl__icon">🚗</span>
              <strong>Premium</strong>
              <small>Hasta 100.000 números individuales (5 dígitos). Vendes en paquetes de 30/50/100.</small>
              <small class="tpl__use">Ej: moto, carro, casa.</small>
            </button>

            <button type="button" class="tpl" [class.tpl--active]="form.template === 'express'"
                    (click)="applyTemplate('express')">
              <span class="tpl__icon">⚡</span>
              <strong>Express</strong>
              <small>100 números (2 dígitos), 1 por boleta. Sorteo en 24‑72h.</small>
              <small class="tpl__use">Ej: bonos, mercados, spa.</small>
            </button>

            <button type="button" class="tpl" [class.tpl--active]="form.template === 'custom'"
                    (click)="applyTemplate('custom')">
              <span class="tpl__icon">🛠️</span>
              <strong>Personalizada</strong>
              <small>Tú defines todos los valores desde cero.</small>
              <small class="tpl__use">Para casos especiales.</small>
            </button>
          </div>
        </section>

        <!-- ============ PAQUETES (solo modo Premium) ============ -->
        @if (form.mode === 'package') {
          <section class="section">
            <h3>Paquetes de venta</h3>
            <p class="muted hint">
              Define los paquetes que tus vendedores van a ofrecer. Cada paquete
              entrega N números aleatorios al cliente.
            </p>
            @for (p of form.package_options; track $index; let i = $index) {
              <div class="pkg-row">
                <app-input label="N° de números" type="number" inputmode="numeric"
                            [(ngModel)]="p.size" [name]="'pkg_size_' + i" icon="123" />
                <app-input label="Precio (COP)" type="number" inputmode="numeric"
                            [(ngModel)]="p.price" [name]="'pkg_price_' + i" icon="payments" />
                @if (form.package_options.length > 1) {
                  <button type="button" class="del-btn" (click)="removePackage(i)" aria-label="Eliminar">
                    <span class="material-icons">close</span>
                  </button>
                }
              </div>
            }
            <app-button variant="secondary" size="sm" icon="add" (click)="addPackage()">
              Agregar paquete
            </app-button>
            <app-input label="Compra mínima (números)" type="number" inputmode="numeric"
                        [(ngModel)]="form.min_package_size" name="min_package_size"
                        icon="filter_list"
                        hint="Tamaño mínimo del paquete que un cliente puede comprar. Por defecto: el paquete más chico." />
          </section>
        }

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
            <app-input label="Umbral para sortear *" type="number" inputmode="numeric"
                        [(ngModel)]="form.min_paid_threshold" name="min_paid_threshold"
                        icon="flag"
                        hint="Boletas pagadas mínimas para habilitar el botón 'Registrar ganador'. Editable luego." />
          </div>
        </section>

        <!-- ============ COMISIÓN VENDEDOR ============ -->
        <section class="section">
          <div class="section__head">
            <h3>Comisión del vendedor</h3>
          </div>
          <p class="muted hint">
            <strong>Una vez creada la rifa, la comisión no se puede modificar.</strong>
            Elige comisión plana (mismo monto por boleta) o escalonada por tramos.
          </p>

          <div class="seg">
            <button type="button" class="seg__btn"
                    [class.seg__btn--active]="!form.useTiers"
                    (click)="setUseTiers(false)">Comisión plana</button>
            <button type="button" class="seg__btn"
                    [class.seg__btn--active]="form.useTiers"
                    (click)="setUseTiers(true)">Escalonada por tramos</button>
          </div>

          @if (!form.useTiers) {
            <app-input label="Comisión por boleta (COP)" type="number" inputmode="numeric"
                        [(ngModel)]="form.seller_commission" name="seller_commission" icon="redeem"
                        hint="Mismo monto por cada boleta vendida." />
          } @else {
            <p class="muted hint">
              El tramo alcanzado por el total de boletas vendidas aplica a <strong>todas</strong> sus boletas
              (modelo calificador). Ej: 36 boletas → entra al tramo 31–50 y cobra ese monto por las 36.
            </p>

            <div class="tiers">
              @for (t of form.commission_tiers; track $index; let i = $index; let last = $last) {
                <div class="tier-row">
                  <div class="tier-row__range">
                    <app-input label="Desde (boletas)" type="number" inputmode="numeric"
                                [ngModel]="t.from_count" (ngModelChange)="updateTierFrom(i, $event)"
                                [name]="'tier_from_' + i" icon="south" />
                    @if (!last) {
                      <app-input label="Hasta (boletas)" type="number" inputmode="numeric"
                                  [ngModel]="t.to_count" (ngModelChange)="updateTierTo(i, $event)"
                                  [name]="'tier_to_' + i" icon="north" />
                    } @else {
                      <div class="tier-row__open">
                        <span class="material-icons">all_inclusive</span>
                        <span>Sin límite superior</span>
                      </div>
                    }
                  </div>
                  <app-input label="Pesos por boleta (COP)" type="number" inputmode="numeric"
                              [(ngModel)]="t.amount_per_ticket" [name]="'tier_amount_' + i" icon="payments" />
                  @if (form.commission_tiers.length > 1) {
                    <button type="button" class="del-btn" (click)="removeTier(i)" aria-label="Eliminar tramo">
                      <span class="material-icons">close</span>
                    </button>
                  }
                </div>
              }
            </div>

            <app-button variant="secondary" size="sm" icon="add" (click)="addTier()">
              Agregar tramo
            </app-button>

            <div class="tier-preview">
              <strong>Ejemplos con los tramos actuales:</strong>
              <ul>
                @for (ex of tierExamples(); track ex.count) {
                  <li>{{ ex.count }} boletas → {{ ex.label }}</li>
                }
              </ul>
            </div>
          }
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
          <p class="muted hint">
            Debes registrar al menos el <strong>premio mayor</strong> (posición 1). Los premios
            menores los puedes agregar aquí o más tarde desde la página de la rifa.
          </p>
          @if (!form.prizes.length) {
            <p class="muted hint">Aún no hay premios. Agrega el premio mayor antes de crear la rifa.</p>
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

    /* ============ Template selector (modalidades) ============ */
    .tpl-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
      gap: var(--s-3);
    }
    .tpl {
      background: var(--bg-base);
      border: 1.5px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
      cursor: pointer;
      text-align: left;
      display: grid;
      gap: 4px;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .tpl:hover { border-color: var(--accent); transform: translateY(-2px); }
    .tpl--active {
      border-color: var(--accent);
      background: var(--accent-soft);
      box-shadow: 0 4px 14px -6px color-mix(in srgb, var(--accent) 40%, transparent);
    }
    .tpl__icon { font-size: 24px; }
    .tpl strong { font-size: 14px; color: var(--text); }
    .tpl small { color: var(--text-muted); font-size: 12px; line-height: 1.4; }
    .tpl__use { color: var(--accent) !important; font-weight: 600; font-size: 11px !important; }
    .tpl--active .tpl__use { color: var(--accent-fg) !important; }
    .tpl--active strong, .tpl--active small { color: var(--accent-fg) !important; }

    /* ============ Paquetes ============ */
    .pkg-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: var(--s-3);
      align-items: end;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    @media (max-width: 540px) {
      .pkg-row { grid-template-columns: 1fr 1fr; }
    }

    .seg {
      display: inline-flex;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: 4px;
      gap: 4px;
      width: fit-content;
    }
    .seg__btn {
      background: transparent;
      border: 0;
      padding: 6px 14px;
      border-radius: var(--r-sm);
      font-size: 13px;
      font-weight: 600;
      color: var(--text-muted);
      cursor: pointer;
    }
    .seg__btn--active { background: var(--accent); color: var(--accent-fg); }

    .tiers { display: grid; gap: var(--s-3); }
    .tier-row {
      display: grid;
      grid-template-columns: 1fr 1fr auto;
      gap: var(--s-3);
      align-items: end;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
    }
    .tier-row__range { display: grid; grid-template-columns: 1fr 1fr; gap: var(--s-3); }
    .tier-row__open {
      display: flex; align-items: center; gap: 6px;
      color: var(--text-muted); font-size: 12px;
      padding: 10px 12px;
      background: var(--bg-input);
      border-radius: var(--r-md);
      height: 100%;
    }
    .tier-row__open .material-icons { font-size: 18px; }

    @media (max-width: 540px) {
      .tier-row { grid-template-columns: 1fr; }
      .tier-row__range { grid-template-columns: 1fr 1fr; }
    }

    .tier-preview {
      padding: var(--s-3);
      background: var(--accent-soft);
      color: var(--accent);
      border-radius: var(--r-md);
      font-size: 13px;
    }
    .tier-preview strong { display: block; margin-bottom: 4px; }
    .tier-preview ul { margin: 0; padding-left: 18px; }
    .tier-preview li { font-variant-numeric: tabular-nums; }

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
    useTiers: boolean;
    commission_tiers: TierForm[];
    min_paid_threshold: number;
    final_draw_date: string;
    primary_color: string;
    lottery_name: string;
    responsible_name: string;
    responsible_phone: string;
    responsible_email: string;
    terms: string;
    prizes: PrizeForm[];
    // Modalidad seleccionada
    template: RaffleModeKey;
    mode: 'classic' | 'package' | 'express';
    package_options: PackageOption[];
    min_package_size: number | null;
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
      useTiers: true,
      commission_tiers: [
        { from_count: 1,  to_count: 30,   amount_per_ticket: 3000 },
        { from_count: 31, to_count: 50,   amount_per_ticket: 4000 },
        { from_count: 51, to_count: null, amount_per_ticket: 5000 },
      ],
      min_paid_threshold: 200,
      final_draw_date: inThreeMonths.toISOString().slice(0, 10),
      primary_color: '#1e8e54',
      lottery_name: '',
      responsible_name: '',
      responsible_phone: '',
      responsible_email: '',
      terms: '',
      prizes: [],
      template: 'classic' as RaffleModeKey,
      mode: 'classic' as 'classic' | 'package' | 'express',
      package_options: [] as PackageOption[],
      min_package_size: null as number | null,
    };
  }

  /** Aplica los valores típicos del template seleccionado. */
  applyTemplate(t: RaffleModeKey): void {
    this.form.template = t;
    if (t === 'classic') {
      this.form.mode = 'classic';
      this.form.total_tickets = 500;
      this.form.numbers_per_ticket = 20;
      this.form.number_min = 0;
      this.form.number_max = 9999;
      this.form.number_digits = 4;
      this.form.ticket_price = 20000;
      this.form.package_options = [];
      this.form.min_package_size = null;
    } else if (t === 'package') {
      this.form.mode = 'package';
      // Premium con 5 dígitos por defecto (100.000 números). Es lo más
      // típico para premios grandes tipo moto/carro.
      this.form.total_tickets = 100000;
      this.form.numbers_per_ticket = 1;
      this.form.number_min = 0;
      this.form.number_max = 99999;
      this.form.number_digits = 5;
      this.form.ticket_price = 400; // precio por número
      this.form.package_options = [
        { size: 30,  price: 12000 },
        { size: 50,  price: 20000 },
        { size: 100, price: 36000 },
      ];
      this.form.min_package_size = 30;
    } else if (t === 'express') {
      this.form.mode = 'express';
      this.form.total_tickets = 100;
      this.form.numbers_per_ticket = 1;
      this.form.number_min = 0;
      this.form.number_max = 99;
      this.form.number_digits = 2;
      this.form.ticket_price = 5000;
      this.form.package_options = [];
      this.form.min_package_size = null;
    }
    // 'custom': no toca nada, mantiene el estado actual del formulario.
    // Solo marca template='custom' para que el usuario sepa que es libre.
    if (t === 'custom') {
      this.form.mode = 'classic'; // por defecto técnico, pero el user edita todo
    }
  }

  addPackage(): void {
    const last = this.form.package_options[this.form.package_options.length - 1];
    const nextSize = last ? Math.max(last.size + 20, 50) : 30;
    const nextPrice = last ? Math.round(last.price * (nextSize / last.size)) : 12000;
    this.form.package_options.push({ size: nextSize, price: nextPrice });
  }

  removePackage(i: number): void {
    this.form.package_options.splice(i, 1);
  }

  setUseTiers(v: boolean) {
    this.form.useTiers = v;
  }

  addTier() {
    const tiers = this.form.commission_tiers;
    const last = tiers[tiers.length - 1];
    if (last) {
      // El último deja de ser abierto; el nuevo se vuelve el abierto
      const lastFrom = Number(last.from_count) || 1;
      const lastTo = last.to_count != null ? Number(last.to_count) : lastFrom + 19;
      last.to_count = lastTo;
      tiers.push({
        from_count: lastTo + 1,
        to_count: null,
        amount_per_ticket: Number(last.amount_per_ticket) + 1000,
      });
    } else {
      tiers.push({ from_count: 1, to_count: null, amount_per_ticket: 3000 });
    }
  }

  removeTier(i: number) {
    this.form.commission_tiers.splice(i, 1);
    // Asegurar que el último tramo quede abierto (to_count = null)
    const tiers = this.form.commission_tiers;
    if (tiers.length) tiers[tiers.length - 1].to_count = null;
  }

  updateTierFrom(i: number, value: number) {
    this.form.commission_tiers[i].from_count = Number(value) || 0;
  }

  updateTierTo(i: number, value: number) {
    this.form.commission_tiers[i].to_count = value == null || value === ('' as any) ? null : Number(value);
  }

  readonly tierExamples = computed(() => {
    if (!this.form.useTiers) return [];
    const tiers = this.form.commission_tiers;
    if (!tiers.length) return [];
    const fmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
    const samples: number[] = [];
    const ordered = [...tiers].sort((a, b) => a.from_count - b.from_count);
    for (const t of ordered) {
      samples.push(Number(t.from_count));
      if (t.to_count != null) samples.push(Number(t.to_count));
    }
    const unique = [...new Set(samples)].filter(n => n > 0).slice(0, 6);
    return unique.map(count => {
      const tier = ordered.find(t =>
        count >= t.from_count && (t.to_count == null || count <= t.to_count),
      );
      const per = tier ? Number(tier.amount_per_ticket) : 0;
      const total = per * count;
      return {
        count,
        label: `${count} × $${fmt.format(per)} = $${fmt.format(total)}`,
      };
    });
  });

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
    if (!this.form.min_paid_threshold || this.form.min_paid_threshold < 1) {
      this.error.set('El umbral para sortear debe ser al menos 1 boleta.');
      return;
    }
    if (!this.mathValid()) {
      this.error.set('La matemática no cuadra: revisa total de boletas, números por boleta y el rango.');
      return;
    }

    // Validaciones de modo Premium (paquetes)
    if (this.form.mode === 'package') {
      const pkgs = this.form.package_options;
      if (!pkgs.length) {
        this.error.set('En modo Premium debes definir al menos un paquete.');
        return;
      }
      for (const p of pkgs) {
        if (!p.size || p.size < 1) {
          this.error.set('Cada paquete debe tener al menos 1 número.');
          return;
        }
        if (!p.price || p.price <= 0) {
          this.error.set('Cada paquete debe tener un precio mayor a cero.');
          return;
        }
        if (p.size > this.form.total_tickets) {
          this.error.set(`El paquete de ${p.size} excede el total (${this.form.total_tickets}).`);
          return;
        }
      }
      if (this.form.numbers_per_ticket !== 1) {
        this.error.set('En modo Premium cada ticket debe tener 1 número. Cambia "Números por boleta" a 1.');
        return;
      }
    }
    if (!this.form.prizes.length) {
      this.error.set('Agrega al menos el premio mayor antes de crear la rifa.');
      return;
    }
    if (!this.form.prizes.some((p) => p.position === 1)) {
      this.error.set('Debes incluir el premio mayor (posición 1).');
      return;
    }
    for (const p of this.form.prizes) {
      if (!p.name.trim() || !p.draw_date) {
        this.error.set(`Completa nombre y fecha del premio #${p.position}.`);
        return;
      }
    }

    // Validar tramos de comisión (si aplica)
    if (this.form.useTiers) {
      const tiers = [...this.form.commission_tiers].sort((a, b) => a.from_count - b.from_count);
      if (!tiers.length) {
        this.error.set('Define al menos un tramo de comisión, o elige comisión plana.');
        return;
      }
      if (Number(tiers[0].from_count) !== 1) {
        this.error.set('El primer tramo debe empezar en 1 boleta.');
        return;
      }
      for (let i = 0; i < tiers.length; i++) {
        const t = tiers[i];
        const isLast = i === tiers.length - 1;
        if (Number(t.amount_per_ticket) < 0) {
          this.error.set(`El monto del tramo #${i + 1} no puede ser negativo.`);
          return;
        }
        if (!isLast) {
          if (t.to_count == null) {
            this.error.set(`Solo el último tramo puede quedar abierto. Cierra el tramo #${i + 1}.`);
            return;
          }
          if (Number(t.to_count) < Number(t.from_count)) {
            this.error.set(`En el tramo #${i + 1}: "hasta" no puede ser menor que "desde".`);
            return;
          }
          const next = tiers[i + 1];
          if (Number(next.from_count) !== Number(t.to_count) + 1) {
            this.error.set(`Los tramos deben ser consecutivos sin huecos (revisa tramos #${i + 1} y #${i + 2}).`);
            return;
          }
        }
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
        mode: this.form.mode,
        package_options: this.form.mode === 'package'
          ? this.form.package_options.map(p => ({
              size: Number(p.size),
              price: Number(p.price),
            }))
          : undefined,
        min_package_size: this.form.mode === 'package' && this.form.min_package_size
          ? Number(this.form.min_package_size)
          : undefined,
        total_tickets: Number(this.form.total_tickets),
        numbers_per_ticket: Number(this.form.numbers_per_ticket),
        number_min: Number(this.form.number_min),
        number_max: Number(this.form.number_max),
        number_digits: Number(this.form.number_digits),
        ticket_price: Number(this.form.ticket_price),
        min_paid_threshold: Number(this.form.min_paid_threshold),
        seller_commission: this.form.useTiers ? 0 : Number(this.form.seller_commission || 0),
        commission_tiers: this.form.useTiers
          ? this.form.commission_tiers.map(t => ({
              from_count: Number(t.from_count),
              to_count: t.to_count == null ? null : Number(t.to_count),
              amount_per_ticket: Number(t.amount_per_ticket),
            }))
          : undefined,
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
