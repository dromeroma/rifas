import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Tenant } from '@core/models/tenant.model';
import { TenantsService } from '@core/services/tenants.service';
import { ButtonComponent, CardComponent, ChipComponent, EmptyComponent, KpiComponent } from '@shared/ui';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    ButtonComponent, CardComponent, ChipComponent, EmptyComponent, KpiComponent,
  ],
  template: `
    <div class="page">
      <header class="page__head">
        <div>
          <h1>Estado de Boletera</h1>
          <p class="muted">Vista global de la plataforma. Aquí no se administran rifas — solo cuentas.</p>
        </div>
        <app-button variant="primary" icon="add" routerLink="/admin/tenants">
          Gestionar cuentas
        </app-button>
      </header>

      @if (loading()) {
        <p class="muted">Cargando cuentas...</p>
      } @else {
        <!-- KPIs principales -->
        <section class="kpis">
          <app-kpi label="Total de cuentas"  [value]="kpis().total"      icon="business"     tone="info" />
          <app-kpi label="Activas"           [value]="kpis().active"     icon="check_circle" tone="accent" />
          <app-kpi label="Por vencer (≤ 7d)" [value]="kpis().expiring"   icon="schedule"     tone="warning" />
          <app-kpi label="En gracia"         [value]="kpis().grace"      icon="warning"      tone="warning" />
          <app-kpi label="Vencidas"          [value]="kpis().expired"    icon="error_outline" tone="danger" />
          <app-kpi label="Suspendidas"       [value]="kpis().suspended"  icon="block"        tone="danger" />
        </section>

        <!-- Uso agregado -->
        <section class="kpis kpis--secondary">
          <app-kpi label="Rifas activas en plataforma" [value]="usage().rafflesUsed"
                   icon="casino" hint="Suma del uso real de todas las cuentas" />
          <app-kpi label="Capacidad total contratada"  [value]="usage().rafflesMax"
                   icon="inventory_2" hint="Suma de max_raffles configurados" />
          <app-kpi label="Vendedores en plataforma"    [value]="usage().sellers"
                   icon="badge" />
          <app-kpi label="Admins de cuentas"           [value]="usage().admins"
                   icon="person" />
        </section>

        <!-- Cuentas que necesitan atención -->
        @if (attentionList().length) {
          <app-card title="Cuentas que necesitan atención"
                    [subtitle]="attentionList().length + ' cuenta(s)'">
            <ul class="list">
              @for (t of attentionList(); track t.id) {
                <li>
                  <div class="row">
                    <div>
                      <strong>{{ t.name }}</strong>
                      <small class="muted">vence {{ t.end_date }}</small>
                    </div>
                    <app-chip [tone]="statusTone(t.subscription_status)">
                      {{ statusLabel(t.subscription_status) }}
                    </app-chip>
                  </div>
                </li>
              }
            </ul>
            <div slot="actions">
              <app-button variant="secondary" size="sm" routerLink="/admin/tenants">
                Ver todas
              </app-button>
            </div>
          </app-card>
        }

        <!-- Lista completa de cuentas (preview de hasta 6) -->
        <app-card title="Cuentas registradas" [subtitle]="tenants().length + ' total(es)'">
          <div slot="actions">
            <app-button variant="secondary" size="sm" routerLink="/admin/tenants">
              Gestionar →
            </app-button>
          </div>
          @if (!tenants().length) {
            <app-empty icon="business"
                       title="Aún no hay cuentas"
                       description="Crea la primera desde 'Gestionar cuentas'." />
          } @else {
            <ul class="list">
              @for (t of preview(); track t.id) {
                <li>
                  <div class="row">
                    <div>
                      <strong>{{ t.name }}</strong>
                      <small class="muted">{{ t.usage.raffles_used }}/{{ t.usage.raffles_max }} rifas · vence {{ t.end_date }}</small>
                    </div>
                    <app-chip [tone]="statusTone(t.subscription_status)">
                      {{ statusLabel(t.subscription_status) }}
                    </app-chip>
                  </div>
                </li>
              }
            </ul>
          }
        </app-card>
      }
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-5); }
    .page__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); flex-wrap: wrap; }
    .page__head h1 { font-size: 24px; }
    .muted { color: var(--text-muted); font-size: 13px; }

    .kpis {
      display: grid; gap: var(--s-3);
      grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    }
    .kpis--secondary { grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); }

    .list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .list li {
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
    }
    .row { display: flex; justify-content: space-between; align-items: center; gap: var(--s-3); }
    .row strong { display: block; font-size: 14px; color: var(--text); }
    .row small { display: block; font-size: 12px; margin-top: 2px; }
  `],
})
export class SuperAdminDashboardComponent implements OnInit {
  private readonly tenantsSvc = inject(TenantsService);

  loading = signal(true);
  tenants = signal<Tenant[]>([]);

  readonly kpis = computed(() => {
    const ts = this.tenants();
    const now = Date.now();
    const sevenDays = 7 * 86_400_000;
    let active = 0, expiring = 0, grace = 0, expired = 0, suspended = 0;
    for (const t of ts) {
      switch (t.subscription_status) {
        case 'active': {
          const daysLeft = (new Date(t.end_date).getTime() - now) / 86_400_000;
          if (daysLeft >= 0 && daysLeft <= 7) expiring++;
          else active++;
          break;
        }
        case 'grace_period': grace++; break;
        case 'expired':      expired++; break;
        case 'suspended':    suspended++; break;
      }
    }
    return { total: ts.length, active, expiring, grace, expired, suspended };
  });

  readonly usage = computed(() => {
    const ts = this.tenants();
    return ts.reduce(
      (acc, t) => ({
        rafflesUsed: acc.rafflesUsed + t.usage.raffles_used,
        rafflesMax:  acc.rafflesMax  + t.usage.raffles_max,
        sellers:     acc.sellers     + t.usage.sellers_count,
        admins:      acc.admins      + t.usage.admins_count,
      }),
      { rafflesUsed: 0, rafflesMax: 0, sellers: 0, admins: 0 },
    );
  });

  readonly attentionList = computed(() =>
    this.tenants().filter((t) =>
      ['grace_period', 'expired', 'suspended'].includes(t.subscription_status) ||
      (t.subscription_status === 'active' &&
        (new Date(t.end_date).getTime() - Date.now()) / 86_400_000 <= 7),
    ),
  );

  readonly preview = computed(() => this.tenants().slice(0, 6));

  ngOnInit(): void {
    this.tenantsSvc.list().subscribe({
      next: (ts) => { this.tenants.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
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
    return ({
      active: 'Activa',
      grace_period: 'En gracia',
      expired: 'Vencida',
      suspended: 'Suspendida',
      not_started: 'No iniciada',
    } as Record<string, string>)[s] ?? s;
  }
}
