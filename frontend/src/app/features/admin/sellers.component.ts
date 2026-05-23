import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SellerSummary } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { ToastService } from '@core/services/toast.service';
import {
  AvatarComponent, ButtonComponent, ChipComponent,
  EmptyComponent, InputComponent, ModalComponent,
} from '@shared/ui';

@Component({
  selector: 'app-sellers',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    AvatarComponent, ButtonComponent, ChipComponent,
    EmptyComponent, InputComponent, ModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Vendedores</h1>
          <p class="muted">{{ sellers().length }} vendedor(es) registrado(s).</p>
        </div>
        <div class="page__actions">
          <app-input
            class="search"
            placeholder="Buscar por nombre, email o teléfono..."
            icon="search"
            [(ngModel)]="searchQuery"
            name="search"
          />
          <app-button icon="add" variant="primary" (click)="openModal()">
            Nuevo vendedor
          </app-button>
        </div>
      </header>

      @if (loading()) {
        <p class="muted">Cargando...</p>
      } @else if (!sellers().length) {
        <app-empty
          icon="badge"
          title="Aún no hay vendedores"
          description="Crea el primero con el botón Nuevo vendedor."
        />
      } @else if (!filtered().length) {
        <app-empty
          icon="search_off"
          title="Sin resultados"
          description="Ningún vendedor coincide con la búsqueda."
        />
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th>Vendedor</th>
                <th>Contacto</th>
                <th class="num">Boletas asignadas</th>
                <th class="num">Boletas pagadas</th>
                <th class="num">Comisión generada</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              @for (s of filtered(); track s.id) {
                <tr [class.row--inactive]="!s.is_active">
                  <td>
                    <div class="who">
                      <app-avatar [name]="s.full_name" [size]="36" />
                      <div class="who__info">
                        <strong>{{ s.full_name }}</strong>
                        @if (s.default_commission) {
                          <small class="muted">
                            Default: {{ '$' + fmt(s.default_commission) }} / boleta
                          </small>
                        }
                      </div>
                    </div>
                  </td>
                  <td>
                    <div class="contact">
                      <small>{{ s.email }}</small>
                      @if (s.phone) { <small class="muted">{{ s.phone }}</small> }
                    </div>
                  </td>
                  <td class="num">
                    <strong>{{ s.assigned_tickets }}</strong>
                  </td>
                  <td class="num">
                    <strong>{{ s.paid_tickets }}</strong>
                  </td>
                  <td class="num">
                    <strong class="money">{{ '$' + fmt(s.commission_total) }}</strong>
                    @if (s.commission_pending > 0) {
                      <small class="pending">
                        Pendiente: {{ '$' + fmt(s.commission_pending) }}
                      </small>
                    }
                  </td>
                  <td>
                    <app-chip [tone]="s.is_active ? 'accent' : 'danger'">
                      {{ s.is_active ? 'Activo' : 'Inactivo' }}
                    </app-chip>
                  </td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>

    <!-- Modal Crear Vendedor -->
    <app-modal
      [open]="modalOpen()"
      title="Crear vendedor"
      subtitle="El vendedor podrá iniciar sesión y reservar boletas para clientes."
      icon="badge"
      size="md"
      (close)="closeModal()"
    >
      <form id="seller-form" class="form" (ngSubmit)="save()">
        <div class="form__row">
          <app-input label="Nombre completo" [(ngModel)]="form.full_name" name="full_name" icon="person" />
          <app-input label="Email" type="email" [(ngModel)]="form.email" name="email" icon="alternate_email" />
        </div>
        <app-input label="Teléfono" [(ngModel)]="form.phone" name="phone" icon="phone" inputmode="tel" />
        <app-input
          label="Contraseña"
          type="text"
          [(ngModel)]="form.password" name="password" icon="lock"
          hint="Mínimo 6 caracteres. El vendedor podrá cambiarla después."
        />
        <app-input
          label="Comisión por boleta vendida (COP)"
          type="number"
          [(ngModel)]="form.default_commission" name="commission"
          icon="payments" inputmode="numeric"
          hint="Opcional. Si lo dejas vacío usa el valor de la rifa."
        />
        @if (error()) {
          <div class="alert">
            <span class="material-icons">error_outline</span>
            {{ error() }}
          </div>
        }
      </form>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closeModal()">Cancelar</app-button>
        <app-button
          type="button"
          variant="primary"
          icon="check"
          [loading]="saving()"
          (click)="save()"
        >
          {{ saving() ? 'Guardando...' : 'Crear vendedor' }}
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head {
      display: flex; justify-content: space-between;
      align-items: flex-start; gap: var(--s-3); flex-wrap: wrap;
    }
    .page__head h1 { font-size: 22px; margin: 0; }
    .page__actions {
      display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap;
    }
    .page__actions .search { min-width: 260px; }
    .muted { color: var(--text-muted); font-size: 13px; }

    /* ===== Tabla ===== */
    .table-wrap {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      overflow: hidden;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .table thead th {
      background: var(--bg-base);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 12px var(--s-3);
      text-align: left;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .table tbody td {
      padding: 14px var(--s-3);
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .table tbody tr:last-child td { border-bottom: 0; }
    .table tbody tr { transition: background var(--t-fast); }
    .table tbody tr:hover { background: var(--accent-soft); }
    .table tbody tr.row--inactive { opacity: 0.55; }

    .table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
    .table .num strong { font-size: 14px; color: var(--text); font-weight: 700; }
    .money { color: var(--accent); }
    .pending {
      display: block;
      font-size: 11px;
      color: var(--warning);
      margin-top: 2px;
    }

    .who { display: flex; align-items: center; gap: var(--s-2); min-width: 180px; }
    .who__info { display: grid; gap: 2px; min-width: 0; }
    .who__info strong { font-size: 14px; color: var(--text); }
    .who__info small { font-size: 11px; }

    .contact { display: grid; gap: 2px; min-width: 0; }
    .contact small { font-size: 12px; }
    .contact small:first-child { color: var(--text); }

    @media (max-width: 720px) {
      .table-wrap { overflow-x: auto; }
      .table { min-width: 760px; }
      .page__actions .search { min-width: 0; flex: 1; }
    }

    /* ===== Modal form ===== */
    .form { display: grid; gap: var(--s-4); }
    .form__row { display: grid; grid-template-columns: 1fr; gap: var(--s-3); }
    @media (min-width: 540px) {
      .form__row { grid-template-columns: repeat(2, 1fr); }
    }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class SellersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly toast = inject(ToastService);

  loading = signal(true);
  modalOpen = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  sellers = signal<SellerSummary[]>([]);
  searchQuery = '';

  readonly filtered = computed(() => {
    const q = this.searchQuery.trim().toLowerCase();
    if (!q) return this.sellers();
    return this.sellers().filter((s) =>
      s.full_name.toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.phone?.toLowerCase().includes(q) ?? false),
    );
  });

  form: { full_name: string; email: string; phone?: string; password: string; default_commission?: number } = {
    full_name: '', email: '', phone: '', password: '', default_commission: undefined,
  };

  ngOnInit(): void { this.refresh(); }

  openModal() {
    this.error.set(null);
    this.form = { full_name: '', email: '', phone: '', password: '', default_commission: undefined };
    this.modalOpen.set(true);
  }
  closeModal() { this.modalOpen.set(false); }

  refresh() {
    this.loading.set(true);
    this.admin.sellersSummary().subscribe({
      next: (s) => { this.sellers.set(s); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  save() {
    this.error.set(null);
    if (!this.form.full_name || !this.form.email || !this.form.password) {
      this.error.set('Nombre, email y contraseña son obligatorios');
      return;
    }
    if (this.form.password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres');
      return;
    }
    this.saving.set(true);
    this.admin.createUser({
      email: this.form.email,
      full_name: this.form.full_name,
      password: this.form.password,
      phone: this.form.phone || undefined,
      role: 'seller',
      default_commission: this.form.default_commission,
    }).subscribe({
      next: (u) => {
        this.saving.set(false);
        this.closeModal();
        this.refresh();
        this.toast.success('Vendedor creado', `${u.full_name} (${u.email}) ya puede iniciar sesión.`);
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'Error creando vendedor';
        this.error.set(detail);
        this.saving.set(false);
        this.toast.error('No se pudo crear el vendedor', detail);
      },
    });
  }

  fmt(v: number): string {
    return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 }).format(v);
  }
}
