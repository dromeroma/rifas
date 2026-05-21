import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { Tenant, TenantCreatePayload, TenantUpdatePayload } from '@core/models/tenant.model';
import { ConfirmService } from '@core/services/confirm.service';
import { TenantsService } from '@core/services/tenants.service';
import { ToastService } from '@core/services/toast.service';
import {
  ButtonComponent, ChipComponent, EmptyComponent,
  InputComponent, ModalComponent,
} from '@shared/ui';

@Component({
  selector: 'app-tenants',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    ButtonComponent, ChipComponent, EmptyComponent,
    InputComponent, ModalComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Cuentas</h1>
          <p class="muted">
            {{ tenants().length }} cuenta(s). Cada una es un negocio independiente que
            usa Boletera. Su data está completamente aislada del resto.
          </p>
        </div>
        <app-button icon="add" variant="primary" (click)="openCreate()">
          Nueva cuenta
        </app-button>
      </header>

      @if (loading()) {
        <p class="muted">Cargando cuentas...</p>
      } @else if (!tenants().length) {
        <app-empty
          icon="business"
          title="Aún no hay cuentas"
          description="Crea la primera cuenta para empezar a vender accesos a Boletera."
        />
      } @else {
        <div class="grid">
          @for (t of tenants(); track t.id) {
            <article class="card" [class.card--inactive]="!t.is_active">
              <header class="card__head">
                <div>
                  <strong>{{ t.name }}</strong>
                  <small class="muted">{{ t.slug }}</small>
                </div>
                <app-chip [tone]="statusTone(t.subscription_status)">
                  {{ statusLabel(t.subscription_status) }}
                </app-chip>
              </header>

              <div class="card__stats">
                <div class="stat">
                  <small class="stat__label">Rifas</small>
                  <strong>{{ t.usage.raffles_used }} / {{ t.usage.raffles_max }}</strong>
                </div>
                <div class="stat">
                  <small class="stat__label">Admins</small>
                  <strong>{{ t.usage.admins_count }}</strong>
                </div>
                <div class="stat">
                  <small class="stat__label">Vendedores</small>
                  <strong>{{ t.usage.sellers_count }}</strong>
                </div>
                <div class="stat stat--wide">
                  <small class="stat__label">Vence</small>
                  <strong>{{ t.end_date }}</strong>
                  <small class="muted">{{ daysLabel(t) }}</small>
                </div>
              </div>

              <footer class="card__foot">
                @if (t.billing_email) {
                  <small class="muted">
                    <span class="material-icons">mail</span>{{ t.billing_email }}
                  </small>
                }
                <div class="card__actions">
                  <app-button variant="secondary" size="sm" icon="edit"
                              (click)="openEdit(t)">
                    Editar
                  </app-button>
                  @if (t.is_active) {
                    <app-button variant="secondary" size="sm" icon="block"
                                (click)="suspend(t)">
                      Suspender
                    </app-button>
                  } @else {
                    <app-button variant="secondary" size="sm" icon="play_arrow"
                                (click)="reactivate(t)">
                      Reactivar
                    </app-button>
                  }
                </div>
              </footer>
            </article>
          }
        </div>
      }
    </div>

    <!-- ============ MODAL CREAR/EDITAR ============ -->
    <app-modal
      [open]="modalOpen()"
      [title]="editing() ? 'Editar cuenta' : 'Nueva cuenta'"
      [subtitle]="editing()
        ? 'Cambia la suscripción, el cupo o suspende la cuenta.'
        : 'Crea la cuenta y su admin inicial en un solo paso.'"
      size="lg"
      (close)="closeModal()"
    >
      <form class="form">
        <section class="section">
          <h3>Negocio</h3>
          <app-input label="Nombre del negocio *" [(ngModel)]="form.name" name="name"
                      icon="business" hint="Ej: Rifas Don Pepe" />
          @if (!editing()) {
            <app-input label="Slug (URL-friendly)"
                        [(ngModel)]="form.slug" name="slug" icon="link"
                        hint="Se autogenera del nombre. Solo a-z 0-9 y guiones." />
          }
          <div class="row">
            <app-input label="Email cobranza" type="email"
                        [(ngModel)]="form.billing_email" name="billing_email"
                        icon="alternate_email" />
            <app-input label="Teléfono cobranza"
                        [(ngModel)]="form.billing_phone" name="billing_phone"
                        icon="phone" inputmode="tel" />
          </div>
          <label class="textarea">
            <span>Notas internas (no visibles para la cuenta)</span>
            <textarea rows="2" [(ngModel)]="form.notes" name="notes"
                      placeholder="Ej: cliente referido por X, ofrecer descuento si renueva..."></textarea>
          </label>
        </section>

        <section class="section">
          <h3>Suscripción</h3>
          <div class="row">
            <app-input label="Fecha inicio *" type="date"
                        [(ngModel)]="form.start_date" name="start_date" icon="event" />
            <app-input label="Fecha fin *" type="date"
                        [(ngModel)]="form.end_date" name="end_date" icon="event_busy" />
          </div>
          <app-input label="Cupo de rifas *" type="number" inputmode="numeric"
                      [(ngModel)]="form.max_raffles" name="max_raffles" icon="casino"
                      hint="Cuántas rifas puede crear esta cuenta." />
        </section>

        @if (!editing()) {
          <section class="section">
            <h3>Admin de la cuenta</h3>
            <p class="muted hint">
              Este usuario podrá iniciar sesión y administrar todo dentro de la cuenta.
            </p>
            <app-input label="Nombre completo *"
                        [(ngModel)]="form.admin_full_name" name="admin_full_name" icon="person" />
            <div class="row">
              <app-input label="Email *" type="email"
                          [(ngModel)]="form.admin_email" name="admin_email" icon="alternate_email" />
              <app-input label="Teléfono"
                          [(ngModel)]="form.admin_phone" name="admin_phone"
                          icon="phone" inputmode="tel" />
            </div>
            <app-input label="Contraseña inicial *" type="text"
                        [(ngModel)]="form.admin_password" name="admin_password" icon="lock"
                        hint="Mínimo 6 caracteres. La podrá cambiar después." />
          </section>
        }

        @if (error()) {
          <div class="alert">
            <span class="material-icons">error_outline</span>{{ error() }}
          </div>
        }
      </form>

      <ng-container slot="footer">
        <app-button variant="secondary" (click)="closeModal()">Cancelar</app-button>
        <app-button variant="primary" icon="check" [loading]="saving()" (click)="save()">
          {{ saving() ? 'Guardando...' : (editing() ? 'Guardar cambios' : 'Crear cuenta') }}
        </app-button>
      </ng-container>
    </app-modal>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; }
    .page__head h1 { font-size: 22px; }
    .muted { color: var(--text-muted); font-size: 13px; }
    .hint { font-size: 12px; margin: -4px 0 0; }

    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: var(--s-3); }

    .card {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid; gap: var(--s-3);
      transition: border-color var(--t-fast);
    }
    .card:hover { border-color: var(--accent); }
    .card--inactive { opacity: 0.7; }

    .card__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-2); }
    .card__head strong { display: block; font-size: 16px; color: var(--text); }
    .card__head small { display: block; font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }

    .card__stats {
      display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--s-2);
      padding: var(--s-3);
      background: var(--bg-base);
      border-radius: var(--r-md);
    }
    .stat { display: grid; gap: 2px; }
    .stat--wide { grid-column: 1 / -1; }
    .stat__label { font-size: 10px; letter-spacing: 0.06em; color: var(--text-muted); text-transform: uppercase; }
    .stat strong { font-size: 14px; color: var(--text); font-variant-numeric: tabular-nums; }

    .card__foot { display: flex; justify-content: space-between; align-items: center; gap: var(--s-2); flex-wrap: wrap; }
    .card__foot small { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
    .card__foot small .material-icons { font-size: 14px; }
    .card__actions { display: flex; gap: 6px; }

    .form { display: grid; gap: var(--s-5); }
    .section { display: grid; gap: var(--s-3); }
    .section h3 { font-size: 13px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin: 0; }
    .row { display: grid; grid-template-columns: 1fr; gap: var(--s-3); }
    @media (min-width: 540px) { .row { grid-template-columns: 1fr 1fr; } }

    .textarea { display: grid; gap: 4px; font-size: 12px; color: var(--text-muted); }
    .textarea textarea {
      padding: 10px 12px;
      background: var(--bg-input);
      color: var(--text);
      border: 1px solid transparent;
      border-radius: var(--r-md);
      font-family: inherit; font-size: 14px;
      resize: vertical;
    }
    .textarea textarea:focus { outline: 0; border-color: var(--accent); }

    .alert {
      display: flex; align-items: center; gap: 8px;
      padding: var(--s-3);
      background: var(--danger-soft); color: var(--danger);
      border-radius: var(--r-md);
      font-size: 13px;
    }
  `],
})
export class TenantsComponent implements OnInit {
  private readonly tenantsSvc = inject(TenantsService);
  private readonly toast = inject(ToastService);
  private readonly confirmSvc = inject(ConfirmService);

  loading = signal(true);
  tenants = signal<Tenant[]>([]);

  modalOpen = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);
  editingId = signal<number | null>(null);
  readonly editing = computed(() => this.editingId() !== null);

  form: TenantCreatePayload & { slug?: string } = this.blankForm();

  ngOnInit(): void { this.refresh(); }

  refresh() {
    this.loading.set(true);
    this.tenantsSvc.list().subscribe({
      next: (ts) => { this.tenants.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  blankForm(): TenantCreatePayload {
    const today = new Date();
    const inYear = new Date(today.getFullYear() + 1, today.getMonth(), today.getDate());
    return {
      name: '',
      slug: '',
      start_date: today.toISOString().slice(0, 10),
      end_date: inYear.toISOString().slice(0, 10),
      max_raffles: 1,
      billing_email: '',
      billing_phone: '',
      notes: '',
      admin_full_name: '',
      admin_email: '',
      admin_password: '',
      admin_phone: '',
    };
  }

  openCreate() {
    this.editingId.set(null);
    this.error.set(null);
    this.form = this.blankForm();
    this.modalOpen.set(true);
  }

  openEdit(t: Tenant) {
    this.editingId.set(t.id);
    this.error.set(null);
    this.form = {
      ...this.blankForm(),
      name: t.name,
      slug: t.slug,
      start_date: t.start_date,
      end_date: t.end_date,
      max_raffles: t.max_raffles,
      billing_email: t.billing_email ?? '',
      billing_phone: t.billing_phone ?? '',
      notes: t.notes ?? '',
    };
    this.modalOpen.set(true);
  }

  closeModal() { this.modalOpen.set(false); }

  save() {
    this.error.set(null);
    const f = this.form;
    if (!f.name?.trim()) { this.error.set('El nombre es obligatorio.'); return; }
    if (!f.start_date || !f.end_date) { this.error.set('Fechas de suscripción obligatorias.'); return; }
    if (f.end_date < f.start_date) { this.error.set('La fecha fin no puede ser anterior a la fecha inicio.'); return; }
    if (!f.max_raffles || f.max_raffles < 1) { this.error.set('Cupo de rifas debe ser al menos 1.'); return; }

    this.saving.set(true);

    const id = this.editingId();
    if (id !== null) {
      const payload: TenantUpdatePayload = {
        name: f.name.trim(),
        start_date: f.start_date,
        end_date: f.end_date,
        max_raffles: Number(f.max_raffles),
        billing_email: f.billing_email?.trim() || null,
        billing_phone: f.billing_phone?.trim() || null,
        notes: f.notes?.trim() || null,
      };
      this.tenantsSvc.update(id, payload).subscribe({
        next: (updated) => {
          this.saving.set(false);
          this.closeModal();
          this.tenants.update((arr) => arr.map((t) => (t.id === id ? updated : t)));
          this.toast.success('Cuenta actualizada', updated.name);
        },
        error: (e) => this.handleSaveError(e),
      });
      return;
    }

    // Crear: validar campos del admin
    if (!f.admin_full_name?.trim() || !f.admin_email?.trim() || !f.admin_password?.trim()) {
      this.error.set('Nombre, email y contraseña del admin son obligatorios.');
      this.saving.set(false);
      return;
    }
    if (f.admin_password.length < 6) {
      this.error.set('La contraseña debe tener al menos 6 caracteres.');
      this.saving.set(false);
      return;
    }

    const payload: TenantCreatePayload = {
      name: f.name.trim(),
      slug: f.slug?.trim() || undefined,
      start_date: f.start_date,
      end_date: f.end_date,
      max_raffles: Number(f.max_raffles),
      billing_email: f.billing_email?.trim() || undefined,
      billing_phone: f.billing_phone?.trim() || undefined,
      notes: f.notes?.trim() || undefined,
      admin_full_name: f.admin_full_name.trim(),
      admin_email: f.admin_email.trim(),
      admin_password: f.admin_password,
      admin_phone: f.admin_phone?.trim() || undefined,
    };
    this.tenantsSvc.create(payload).subscribe({
      next: (created) => {
        this.saving.set(false);
        this.closeModal();
        this.tenants.update((arr) => [created, ...arr]);
        this.toast.success(
          `Cuenta "${created.name}" creada`,
          `El admin (${payload.admin_email}) ya puede iniciar sesión.`,
        );
      },
      error: (e) => this.handleSaveError(e),
    });
  }

  private handleSaveError(e: any) {
    this.saving.set(false);
    const detail = e?.error?.detail ?? 'Error al guardar';
    this.error.set(typeof detail === 'string' ? detail : JSON.stringify(detail));
    this.toast.error('No se pudo guardar', this.error() ?? '');
  }

  suspend(t: Tenant) {
    this.confirmSvc.ask({
      title: `¿Suspender "${t.name}"?`,
      message: 'La cuenta no podrá iniciar sesión hasta que la reactives. Su data se conserva.',
      tone: 'warning',
      icon: 'block',
      confirmLabel: 'Sí, suspender',
      cancelLabel: 'Cancelar',
    }).subscribe((yes) => {
      if (!yes) return;
      this.tenantsSvc.update(t.id, { is_active: false }).subscribe({
        next: (u) => {
          this.tenants.update((arr) => arr.map((x) => (x.id === t.id ? u : x)));
          this.toast.success('Cuenta suspendida', t.name);
        },
        error: (e) => this.toast.error('Error', e?.error?.detail ?? 'No se pudo suspender'),
      });
    });
  }

  reactivate(t: Tenant) {
    this.tenantsSvc.update(t.id, { is_active: true }).subscribe({
      next: (u) => {
        this.tenants.update((arr) => arr.map((x) => (x.id === t.id ? u : x)));
        this.toast.success('Cuenta reactivada', t.name);
      },
      error: (e) => this.toast.error('Error', e?.error?.detail ?? 'No se pudo reactivar'),
    });
  }

  statusTone(s: string): 'accent' | 'warning' | 'danger' | 'default' {
    switch (s) {
      case 'active': return 'accent';
      case 'grace_period': return 'warning';
      case 'expired':
      case 'suspended': return 'danger';
      default: return 'default';
    }
  }

  statusLabel(s: string): string {
    return {
      active: 'Activa',
      grace_period: 'Por vencer',
      expired: 'Vencida',
      suspended: 'Suspendida',
      not_started: 'No iniciada',
    }[s] ?? s;
  }

  daysLabel(t: Tenant): string {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(t.end_date);
    end.setHours(0, 0, 0, 0);
    const diff = Math.round((end.getTime() - today.getTime()) / 86_400_000);
    if (diff > 0) return `en ${diff} día(s)`;
    if (diff === 0) return 'vence hoy';
    return `hace ${Math.abs(diff)} día(s)`;
  }
}
