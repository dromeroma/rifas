import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, computed, effect, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { PackageOption, Raffle } from '@core/models/raffle.model';
import { Customer } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { RaffleService } from '@core/services/raffle.service';
import { ToastService } from '@core/services/toast.service';
import {
  ButtonComponent, InputComponent, ModalComponent,
} from '@shared/ui';

/**
 * Modal de venta de paquete (modo Premium). Flujo:
 *  1) Vendedor selecciona un paquete (size + price).
 *  2) Selecciona o crea un cliente.
 *  3) Confirma → backend reserva N números aleatorios.
 *  4) Se muestran los números asignados.
 */
@Component({
  selector: 'app-package-sale-modal',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, InputComponent, ModalComponent,
  ],
  template: `
    <app-modal
      [open]="open()"
      title="Vender paquete"
      [subtitle]="raffle()?.name ?? ''"
      size="md"
      (close)="onClose()"
    >
      <div class="form">

        @if (!result()) {
          <!-- Paso 1: elegir paquete -->
          <section class="section">
            <h3>1. Elige el paquete</h3>
            <div class="pkg-list">
              @for (p of packages(); track p.size) {
                <button type="button" class="pkg"
                        [class.pkg--active]="selectedPkg()?.size === p.size"
                        (click)="selectedPkg.set(p)">
                  <strong class="pkg__size">{{ p.size }}</strong>
                  <small class="muted">números</small>
                  <div class="pkg__price">{{ '$' + fmt(p.price) }}</div>
                </button>
              }
            </div>
          </section>

          <!-- Paso 2: elegir cliente -->
          <section class="section">
            <h3>2. Cliente</h3>
            <p class="muted hint">Busca un cliente existente o crea uno nuevo.</p>

            @if (!createMode()) {
              <app-input
                label="Buscar cliente"
                placeholder="Nombre o teléfono"
                icon="search"
                [(ngModel)]="searchQuery"
                name="search_q"
                (ngModelChange)="onSearch()"
              />
              @if (searchResults().length) {
                <ul class="customers">
                  @for (c of searchResults(); track c.id) {
                    <li>
                      <button type="button" class="cust"
                              [class.cust--active]="selectedCustomer()?.id === c.id"
                              (click)="selectedCustomer.set(c)">
                        <strong>{{ c.full_name }}</strong>
                        <small class="muted">{{ c.phone }}</small>
                      </button>
                    </li>
                  }
                </ul>
              }
              <app-button variant="secondary" icon="add" size="sm" (click)="createMode.set(true)">
                Crear nuevo cliente
              </app-button>
            } @else {
              <div class="row">
                <app-input label="Nombre completo *" [(ngModel)]="newCustomer.full_name" name="cust_name" icon="person" />
                <app-input label="Teléfono *" [(ngModel)]="newCustomer.phone" name="cust_phone" icon="phone" inputmode="tel" />
              </div>
              <div class="row">
                <app-input label="Documento" [(ngModel)]="newCustomer.document" name="cust_doc" icon="badge" />
                <app-input label="Email" type="email" [(ngModel)]="newCustomer.email" name="cust_email" icon="alternate_email" />
              </div>
              <app-button variant="ghost" size="sm" icon="arrow_back" (click)="createMode.set(false)">
                Volver a buscar
              </app-button>
            }
          </section>

          @if (error()) {
            <div class="alert">
              <span class="material-icons">error_outline</span>
              {{ error() }}
            </div>
          }
        }

        @if (result(); as r) {
          <!-- Paso 3: éxito -->
          <section class="section">
            <div class="success">
              <span class="material-icons success__icon">check_circle</span>
              <h2>¡Paquete vendido!</h2>
              <p class="muted">
                Se reservaron <strong>{{ r.reserved }} números</strong> para
                <strong>{{ customerSummary() }}</strong>. Tienes 24h para que el
                cliente complete el pago.
              </p>
            </div>
            <div class="numbers">
              @for (n of r.numbers; track $index) {
                <span class="num">{{ n }}</span>
              }
            </div>
            <p class="muted hint">
              💡 Comparte estos números con el cliente. Una vez te pague, sube el comprobante desde el panel.
            </p>
          </section>
        }
      </div>

      <ng-container slot="footer">
        @if (!result()) {
          <app-button variant="secondary" (click)="onClose()">Cancelar</app-button>
          <app-button variant="primary" icon="shopping_cart"
                      [loading]="saving()"
                      [disabled]="!canSell()"
                      (click)="sell()">
            {{ saving() ? 'Procesando...' : 'Vender paquete' }}
          </app-button>
        } @else {
          <app-button variant="primary" (click)="onClose()">Listo</app-button>
        }
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .form { display: grid; gap: var(--s-4); }
    .section { display: grid; gap: var(--s-3); }
    .section h3 {
      font-size: 13px; color: var(--text-muted); text-transform: uppercase;
      letter-spacing: 0.08em; font-weight: 700; margin: 0;
    }
    .muted { color: var(--text-muted); font-size: 13px; }
    .hint { font-size: 12px; margin: 0; }

    .pkg-list {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: var(--s-2);
    }
    .pkg {
      background: var(--bg-base); border: 1.5px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
      display: grid; gap: 2px;
      cursor: pointer; text-align: center;
      transition: border-color 0.15s ease, transform 0.15s ease;
    }
    .pkg:hover { border-color: var(--accent); transform: translateY(-2px); }
    .pkg--active {
      border-color: var(--accent);
      background: var(--accent-soft);
    }
    .pkg__size {
      font-size: 28px; color: var(--accent); font-weight: 800;
      font-variant-numeric: tabular-nums; line-height: 1;
    }
    .pkg__price { font-weight: 700; margin-top: 4px; }
    .pkg--active .pkg__size, .pkg--active .pkg__price { color: var(--accent-fg); }
    .pkg--active small { color: var(--accent-fg); }

    .customers { list-style: none; padding: 0; margin: 0; display: grid; gap: 4px; max-height: 200px; overflow-y: auto; }
    .cust {
      width: 100%; text-align: left;
      background: var(--bg-base); border: 1px solid var(--border);
      border-radius: var(--r-sm);
      padding: 8px 12px;
      cursor: pointer;
      display: grid; gap: 2px;
    }
    .cust:hover { border-color: var(--accent); }
    .cust--active { border-color: var(--accent); background: var(--accent-soft); }
    .cust strong { font-size: 14px; }
    .cust small { font-size: 12px; }

    .row { display: grid; gap: var(--s-2); grid-template-columns: 1fr 1fr; }
    @media (max-width: 480px) { .row { grid-template-columns: 1fr; } }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md); font-size: 13px;
    }

    .success { display: grid; justify-items: center; text-align: center; gap: 6px; }
    .success__icon {
      font-size: 56px !important; color: var(--accent);
      background: var(--accent-soft);
      width: 88px; height: 88px;
      border-radius: 50%;
      display: grid; place-items: center;
    }
    .success h2 { margin: var(--s-2) 0 0; font-size: 22px; }

    .numbers {
      display: flex; flex-wrap: wrap; gap: 6px;
      padding: var(--s-3);
      background: var(--bg-base);
      border-radius: var(--r-md);
      max-height: 220px; overflow-y: auto;
    }
    .num {
      background: var(--accent); color: var(--accent-fg);
      padding: 6px 12px; border-radius: var(--r-full);
      font-weight: 700; font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
  `],
})
export class PackageSaleModalComponent {
  private readonly raffleSvc = inject(RaffleService);
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  readonly open = input<boolean>(false);
  readonly raffle = input<Raffle | null>(null);

  @Output() close = new EventEmitter<void>();
  @Output() sold = new EventEmitter<{ reserved: number }>();

  readonly packages = computed<PackageOption[]>(() => this.raffle()?.package_options ?? []);

  selectedPkg = signal<PackageOption | null>(null);
  selectedCustomer = signal<Customer | null>(null);
  searchResults = signal<Customer[]>([]);
  createMode = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  result = signal<{ reserved: number; numbers: string[] } | null>(null);

  searchQuery = '';
  newCustomer = { full_name: '', phone: '', document: '', email: '' };

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    effect(() => {
      if (this.open()) {
        // Reset al abrir
        this.selectedPkg.set(null);
        this.selectedCustomer.set(null);
        this.searchResults.set([]);
        this.createMode.set(false);
        this.saving.set(false);
        this.error.set(null);
        this.result.set(null);
        this.searchQuery = '';
        this.newCustomer = { full_name: '', phone: '', document: '', email: '' };
      }
    });
  }

  onSearch() {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    const q = this.searchQuery.trim();
    if (q.length < 2) {
      this.searchResults.set([]);
      return;
    }
    this.searchTimer = setTimeout(() => {
      this.admin.listCustomers({ q }).subscribe({
        next: (cs) => this.searchResults.set(cs.slice(0, 8)),
        error: () => this.searchResults.set([]),
      });
    }, 250);
  }

  canSell(): boolean {
    if (!this.selectedPkg()) return false;
    if (this.createMode()) {
      return !!this.newCustomer.full_name.trim() && !!this.newCustomer.phone.trim();
    }
    return !!this.selectedCustomer();
  }

  customerSummary(): string {
    const c = this.selectedCustomer();
    if (c) return c.full_name;
    if (this.createMode() && this.newCustomer.full_name) return this.newCustomer.full_name;
    return 'el cliente';
  }

  sell() {
    const pkg = this.selectedPkg();
    const r = this.raffle();
    if (!pkg || !r) {
      this.error.set('Selecciona un paquete y la rifa.');
      return;
    }

    this.error.set(null);
    this.saving.set(true);

    const proceed = (customerId: number) => {
      this.raffleSvc.reservePackage({
        raffle_id: r.id,
        package_size: pkg.size,
        customer_id: customerId,
      }).subscribe({
        next: (res) => {
          this.saving.set(false);
          this.result.set({ reserved: res.reserved, numbers: res.numbers });
          this.toast.success(
            `¡${res.reserved} números reservados!`,
            'Comparte los números con el cliente y espera el comprobante.',
          );
          this.sold.emit({ reserved: res.reserved });
        },
        error: (e) => {
          this.saving.set(false);
          this.error.set(e?.error?.detail ?? 'No se pudo reservar el paquete.');
        },
      });
    };

    if (this.createMode()) {
      // Crear cliente nuevo primero
      this.admin.createCustomer({
        full_name: this.newCustomer.full_name.trim(),
        phone: this.newCustomer.phone.trim(),
        document: this.newCustomer.document.trim() || undefined,
        email: this.newCustomer.email.trim() || undefined,
      } as any).subscribe({
        next: (c) => {
          this.selectedCustomer.set(c);
          proceed(c.id);
        },
        error: (e) => {
          this.saving.set(false);
          this.error.set(e?.error?.detail ?? 'No se pudo crear el cliente.');
        },
      });
    } else {
      const c = this.selectedCustomer();
      if (!c) {
        this.saving.set(false);
        this.error.set('Selecciona un cliente.');
        return;
      }
      proceed(c.id);
    }
  }

  onClose() {
    this.close.emit();
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }
}
