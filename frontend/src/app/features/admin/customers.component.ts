import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Customer } from '@core/models/stats.model';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';
import { ToastService } from '@core/services/toast.service';
import {
  AvatarComponent, ButtonComponent,
  EmptyComponent, InputComponent, ModalComponent,
} from '@shared/ui';

@Component({
  selector: 'app-customers',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    AvatarComponent, ButtonComponent,
    EmptyComponent, InputComponent, ModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>{{ pageTitle() }}</h1>
          <p class="muted">{{ isSeller() ? 'Clientes a los que les has reservado o vendido boletas.' : list().length + ' resultado(s).' }}</p>
        </div>
        <app-button icon="add" variant="primary" (click)="openModal()">
          Nuevo cliente
        </app-button>
      </header>

      <div class="search">
        <app-input
          placeholder="Buscar por nombre, documento o teléfono..."
          icon="search"
          [(ngModel)]="query"
          name="q"
        />
        <app-button variant="secondary" icon="search" (click)="search()">Buscar</app-button>
      </div>

      @if (loading()) {
        <p class="muted">Cargando...</p>
      } @else if (!list().length) {
        <app-empty icon="group" title="Sin resultados" description="Crea un cliente o ajusta la búsqueda." />
      } @else {
        <div class="table-wrap">
          <table class="table">
            <thead>
              <tr>
                <th class="th-id">ID</th>
                <th>Cliente</th>
                <th class="th-doc">Documento</th>
                <th class="th-phone">Teléfono</th>
                <th class="th-city">Ciudad</th>
              </tr>
            </thead>
            <tbody>
              @for (c of pageRows(); track c.id) {
                <tr>
                  <td class="td-id num">{{ c.id }}</td>
                  <td>
                    <div class="cell-name">
                      <app-avatar [name]="c.full_name" [size]="28" />
                      <div>
                        <strong>{{ c.full_name }}</strong>
                        @if (c.email) { <small class="muted">{{ c.email }}</small> }
                      </div>
                    </div>
                  </td>
                  <td class="td-doc">{{ c.document || '—' }}</td>
                  <td class="td-phone num">{{ c.phone }}</td>
                  <td class="td-city">{{ c.city || '—' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>

        @if (totalPages() > 1) {
          <div class="pager">
            <button class="pager__btn" [disabled]="page() === 1" (click)="setPage(page() - 1)" aria-label="Anterior">
              <span class="material-icons">chevron_left</span>
            </button>
            <span class="pager__info">
              {{ rangeStart() }}–{{ rangeEnd() }} de {{ list().length }}
            </span>
            <button class="pager__btn" [disabled]="page() === totalPages()" (click)="setPage(page() + 1)" aria-label="Siguiente">
              <span class="material-icons">chevron_right</span>
            </button>
          </div>
        }
      }
    </div>

    <!-- Modal Crear Cliente -->
    <app-modal
      [open]="modalOpen()"
      title="Crear cliente"
      subtitle="Los clientes se asocian a una boleta al reservarla o pagarla."
      size="md"
      (close)="closeModal()"
    >
      <form class="form" (ngSubmit)="save()">
        <app-input label="Nombre completo *" [(ngModel)]="form.full_name" name="full_name" icon="person" />
        <div class="form__row">
          <app-input label="Documento" [(ngModel)]="form.document" name="document" icon="badge" />
          <app-input label="Teléfono *" [(ngModel)]="form.phone" name="phone" icon="phone" inputmode="tel" />
        </div>
        <div class="form__row">
          <app-input label="Email" type="email" [(ngModel)]="form.email" name="email" icon="alternate_email" />
          <app-input label="Ciudad" [(ngModel)]="form.city" name="city" icon="location_city" />
        </div>
        @if (error()) {
          <div class="alert">
            <span class="material-icons">error_outline</span>
            {{ error() }}
          </div>
        }
      </form>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closeModal()">Cancelar</app-button>
        <app-button variant="primary" icon="check" [loading]="saving()" (click)="save()">
          {{ saving() ? 'Guardando...' : 'Crear cliente' }}
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

    .search {
      display: grid; grid-template-columns: 1fr auto; gap: var(--s-2);
      align-items: end;
    }

    .form { display: grid; gap: var(--s-4); }
    .form__row { display: grid; grid-template-columns: 1fr; gap: var(--s-3); }
    @media (min-width: 540px) { .form__row { grid-template-columns: repeat(2, 1fr); } }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }

    /* Tabla */
    .table-wrap {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow-x: auto;
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }
    .table th, .table td {
      text-align: left;
      padding: 10px 12px;
      border-bottom: 1px solid var(--border);
    }
    .table tr:last-child td { border-bottom: 0; }
    .table th {
      background: var(--bg-base);
      color: var(--text-muted);
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
    }
    .table tr:hover td { background: var(--bg-hover); }
    .th-id, .td-id { width: 50px; }
    .num { font-variant-numeric: tabular-nums; }
    .cell-name {
      display: flex; align-items: center; gap: 10px;
    }
    .cell-name strong { display: block; font-size: 13px; color: var(--text); }
    .cell-name small { display: block; font-size: 11px; color: var(--text-muted); }
    .td-doc, .td-phone, .td-city { color: var(--text-muted); }

    @media (max-width: 600px) {
      .th-doc, .td-doc, .th-city, .td-city { display: none; }
    }

    /* Paginación */
    .pager {
      display: flex; align-items: center; justify-content: flex-end;
      gap: var(--s-3);
      padding: var(--s-2) 0;
    }
    .pager__info { color: var(--text-muted); font-size: 12px; }
    .pager__btn {
      width: 36px; height: 36px;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      color: var(--text);
      cursor: pointer;
      display: grid; place-items: center;
    }
    .pager__btn:hover:not(:disabled) { border-color: var(--accent); color: var(--accent); }
    .pager__btn:disabled { opacity: 0.4; cursor: not-allowed; }

    .grid { display: grid; gap: var(--s-2); grid-template-columns: 1fr; }
    @media (min-width: 600px) { .grid { grid-template-columns: repeat(2, 1fr); } }
    @media (min-width: 1024px) { .grid { grid-template-columns: repeat(3, 1fr); } }

    .cust {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      padding: var(--s-3);
      display: flex;
      gap: var(--s-3);
      align-items: center;
    }
    .cust__info { display: grid; gap: 2px; min-width: 0; }
    .cust__info strong { font-size: 14px; }
    .cust__info small { font-size: 12px; }
  `],
})
export class CustomersComponent implements OnInit {
  private readonly admin = inject(AdminService);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  loading = signal(true);
  saving = signal(false);
  modalOpen = signal(false);
  error = signal<string | null>(null);
  list = signal<Customer[]>([]);

  // Paginación
  page = signal(1);
  readonly pageSize = 20;
  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.list().length / this.pageSize)));
  readonly pageRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize;
    return this.list().slice(start, start + this.pageSize);
  });
  readonly rangeStart = computed(() =>
    this.list().length === 0 ? 0 : (this.page() - 1) * this.pageSize + 1,
  );
  readonly rangeEnd = computed(() =>
    Math.min(this.page() * this.pageSize, this.list().length),
  );

  readonly isSeller = computed(() => this.auth.role() === 'seller');
  readonly pageTitle = computed(() => this.isSeller() ? 'Mis clientes' : 'Clientes');

  query = '';
  form = { full_name: '', document: '', phone: '', email: '', city: '' };

  ngOnInit(): void { this.refresh(); }

  setPage(p: number) {
    const max = this.totalPages();
    this.page.set(Math.max(1, Math.min(max, p)));
  }

  openModal() {
    this.error.set(null);
    this.form = { full_name: '', document: '', phone: '', email: '', city: '' };
    this.modalOpen.set(true);
  }
  closeModal() { this.modalOpen.set(false); }

  refresh(q?: string) {
    this.loading.set(true);
    this.admin.listCustomers({ q, mine: this.isSeller() }).subscribe({
      next: (r) => {
        this.list.set(r);
        this.page.set(1);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  search() { this.refresh(this.query || undefined); }

  save() {
    this.error.set(null);
    if (!this.form.full_name || !this.form.phone) {
      this.error.set('Nombre y teléfono son obligatorios');
      return;
    }
    this.saving.set(true);
    this.admin.createCustomer({
      full_name: this.form.full_name,
      document: this.form.document || null,
      phone: this.form.phone,
      email: this.form.email || null,
      city: this.form.city || null,
    }).subscribe({
      next: (c) => {
        this.saving.set(false);
        this.closeModal();
        this.refresh();
        this.toast.success('Cliente creado', `${c.full_name} fue agregado a la lista.`);
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'Error creando cliente';
        this.error.set(detail);
        this.saving.set(false);
        this.toast.error('No se pudo crear el cliente', detail);
      },
    });
  }
}
