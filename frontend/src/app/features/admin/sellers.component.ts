import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
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
        <app-button icon="add" variant="primary" (click)="openModal()">
          Nuevo vendedor
        </app-button>
      </header>

      @if (loading()) {
        <p class="muted">Cargando...</p>
      } @else if (!sellers().length) {
        <app-empty
          icon="badge"
          title="Aún no hay vendedores"
          description="Crea el primero con el botón Nuevo vendedor."
        />
      } @else {
        <div class="list">
          @for (s of sellers(); track s.id) {
            <article class="seller">
              <app-avatar [name]="s.full_name" [size]="44" />
              <div class="seller__info">
                <strong>{{ s.full_name }}</strong>
                <small class="muted">{{ s.email }}{{ s.phone ? ' · ' + s.phone : '' }}</small>
              </div>
              <div class="seller__stats">
                <div class="stat">
                  <small class="stat__label">Boletas pagadas</small>
                  <strong>{{ s.paid_tickets }}</strong>
                </div>
                <div class="stat">
                  <small class="stat__label">Comisión generada</small>
                  <strong class="stat__money">{{ '$' + fmt(s.commission_total) }}</strong>
                </div>
                @if (s.commission_pending > 0) {
                  <small class="stat__pending">
                    Pendiente: {{ '$' + fmt(s.commission_pending) }}
                  </small>
                }
              </div>
              <div class="seller__meta">
                <app-chip [tone]="s.is_active ? 'accent' : 'danger'">
                  {{ s.is_active ? 'Activo' : 'Inactivo' }}
                </app-chip>
                @if (s.default_commission) {
                  <small class="muted">
                    Default: {{ '$' + fmt(s.default_commission) }} / boleta
                  </small>
                }
              </div>
            </article>
          }
        </div>
      }
    </div>

    <!-- Modal Crear Vendedor -->
    <app-modal
      [open]="modalOpen()"
      title="Crear vendedor"
      subtitle="El vendedor podrá iniciar sesión y reservar boletas para clientes."
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
    .page__head h1 { font-size: 22px; }

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

    .list { display: grid; gap: var(--s-2); }
    .seller {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
      display: grid;
      grid-template-columns: auto 1.5fr 1fr auto;
      align-items: center;
      gap: var(--s-3);
    }
    .seller__info { display: grid; gap: 2px; min-width: 0; }
    .seller__info strong { font-size: 14px; color: var(--text); }

    .seller__stats {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: var(--s-2);
      padding: 0 var(--s-3);
      border-left: 1px solid var(--border);
      border-right: 1px solid var(--border);
    }
    .stat { display: grid; gap: 2px; }
    .stat__label { font-size: 11px; letter-spacing: 0.04em; color: var(--text-muted); text-transform: uppercase; }
    .stat strong { font-size: 16px; color: var(--text); font-variant-numeric: tabular-nums; }
    .stat__money { color: var(--accent); }
    .stat__pending {
      grid-column: 1 / -1;
      font-size: 11px;
      color: var(--warning);
      margin-top: 2px;
    }

    .seller__meta { display: grid; gap: 4px; text-align: right; }

    @media (max-width: 720px) {
      .seller {
        grid-template-columns: auto 1fr;
        grid-template-areas:
          'avatar info'
          'stats  stats'
          'meta   meta';
      }
      .seller > app-avatar { grid-area: avatar; }
      .seller__info { grid-area: info; }
      .seller__stats {
        grid-area: stats;
        border: 1px solid var(--border);
        border-radius: var(--r-md);
        padding: var(--s-2);
      }
      .seller__meta { grid-area: meta; text-align: left; flex-direction: row; display: flex; gap: var(--s-2); align-items: center; flex-wrap: wrap; }
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
