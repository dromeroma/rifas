import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { Tenant } from '@core/models/tenant.model';
import { TenantsService } from '@core/services/tenants.service';
import { ButtonComponent, ChipComponent, EmptyComponent } from '@shared/ui';

@Component({
  selector: 'app-super-admin-dashboard',
  standalone: true,
  imports: [
    CommonModule, RouterLink,
    ButtonComponent, ChipComponent, EmptyComponent,
  ],
  template: `
    <div class="page">
      <!-- Hero premium -->
      <section class="hero">
        <div class="hero__bg" aria-hidden="true"></div>
        <div class="hero__content">
          <div>
            <small class="eyebrow">{{ greeting() }}</small>
            <h1>Estado de Boletera</h1>
            <p class="hero__lead">
              Vista global de la plataforma. {{ tenants().length }} cuenta(s) registrada(s)
              · {{ usage().rafflesUsed }} rifas activas · {{ usage().sellers + usage().admins }} usuarios.
            </p>
          </div>
          <div class="hero__actions">
            <app-button variant="primary" icon="add" routerLink="/admin/tenants">
              Gestionar cuentas
            </app-button>
          </div>
        </div>
      </section>

      @if (loading()) {
        <p class="muted">Cargando cuentas...</p>
      } @else {
        <!-- KPIs principales -->
        <section class="kpi-grid">
          <article class="kpi kpi--accent">
            <div class="kpi__icon"><span class="material-icons">business</span></div>
            <div class="kpi__body">
              <small class="kpi__label">Total cuentas</small>
              <strong class="kpi__value">{{ kpis().total }}</strong>
            </div>
          </article>
          <article class="kpi kpi--ok">
            <div class="kpi__icon"><span class="material-icons">check_circle</span></div>
            <div class="kpi__body">
              <small class="kpi__label">Activas</small>
              <strong class="kpi__value">{{ kpis().active }}</strong>
            </div>
          </article>
          <article class="kpi kpi--warn">
            <div class="kpi__icon"><span class="material-icons">schedule</span></div>
            <div class="kpi__body">
              <small class="kpi__label">Por vencer (≤ 7d)</small>
              <strong class="kpi__value">{{ kpis().expiring }}</strong>
            </div>
          </article>
          <article class="kpi kpi--warn">
            <div class="kpi__icon"><span class="material-icons">warning</span></div>
            <div class="kpi__body">
              <small class="kpi__label">En gracia</small>
              <strong class="kpi__value">{{ kpis().grace }}</strong>
            </div>
          </article>
          <article class="kpi kpi--danger">
            <div class="kpi__icon"><span class="material-icons">error_outline</span></div>
            <div class="kpi__body">
              <small class="kpi__label">Vencidas</small>
              <strong class="kpi__value">{{ kpis().expired }}</strong>
            </div>
          </article>
          <article class="kpi kpi--danger">
            <div class="kpi__icon"><span class="material-icons">block</span></div>
            <div class="kpi__body">
              <small class="kpi__label">Suspendidas</small>
              <strong class="kpi__value">{{ kpis().suspended }}</strong>
            </div>
          </article>
        </section>

        <!-- Uso agregado -->
        <section class="usage">
          <article class="usage__card">
            <div class="usage__head">
              <span class="material-icons">casino</span>
              <strong>Rifas en plataforma</strong>
            </div>
            <div class="usage__row">
              <span class="muted">En uso</span>
              <strong>{{ usage().rafflesUsed }}</strong>
            </div>
            <div class="usage__row">
              <span class="muted">Capacidad contratada</span>
              <strong>{{ usage().rafflesMax }}</strong>
            </div>
            <div class="usage__bar">
              <div class="usage__bar-fill" [style.width.%]="usagePct()"></div>
            </div>
            <small class="muted">{{ usagePct() }}% del cupo total utilizado</small>
          </article>
          <article class="usage__card">
            <div class="usage__head">
              <span class="material-icons">groups</span>
              <strong>Usuarios en plataforma</strong>
            </div>
            <div class="usage__row">
              <span class="muted">Admins de cuentas</span>
              <strong>{{ usage().admins }}</strong>
            </div>
            <div class="usage__row">
              <span class="muted">Vendedores</span>
              <strong>{{ usage().sellers }}</strong>
            </div>
            <div class="usage__row usage__row--total">
              <span>Total</span>
              <strong>{{ usage().admins + usage().sellers }}</strong>
            </div>
          </article>
        </section>

        <!-- Atención -->
        @if (attentionList().length) {
          <section class="block block--warn">
            <header class="block__head">
              <div>
                <h2>
                  <span class="material-icons">priority_high</span>
                  Cuentas que necesitan atención
                </h2>
                <p class="muted">{{ attentionList().length }} requiere(n) acción inmediata</p>
              </div>
              <app-button variant="secondary" size="sm" routerLink="/admin/tenants">
                Ver todas
              </app-button>
            </header>
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th>Estado</th>
                    <th>Vence</th>
                    <th class="num">Rifas</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of attentionList(); track t.id) {
                    <tr (click)="openTenant(t)" class="row-clickable">
                      <td>
                        <div class="biz">
                          <strong>{{ t.name }}</strong>
                          <small class="slug">{{ t.slug }}</small>
                        </div>
                      </td>
                      <td>
                        <app-chip [tone]="statusTone(t.subscription_status)">
                          {{ statusLabel(t.subscription_status) }}
                        </app-chip>
                      </td>
                      <td>
                        <strong>{{ t.end_date }}</strong>
                      </td>
                      <td class="num">
                        {{ t.usage.raffles_used }}<span class="muted">/{{ t.usage.raffles_max }}</span>
                      </td>
                      <td class="actions-col">
                        <span class="material-icons chev">chevron_right</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        }

        <!-- Cuentas registradas: tabla -->
        <section class="block">
          <header class="block__head">
            <div>
              <h2>Cuentas registradas</h2>
              <p class="muted">{{ tenants().length }} total(es) · click en una fila para editar</p>
            </div>
            <app-button variant="secondary" size="sm" routerLink="/admin/tenants">
              Gestionar →
            </app-button>
          </header>
          @if (!tenants().length) {
            <app-empty icon="business"
                       title="Aún no hay cuentas"
                       description="Crea la primera desde 'Gestionar cuentas'." />
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead>
                  <tr>
                    <th>Negocio</th>
                    <th>Estado</th>
                    <th class="num">Rifas</th>
                    <th class="num">Usuarios</th>
                    <th>Vence</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (t of tenants(); track t.id) {
                    <tr (click)="openTenant(t)" class="row-clickable">
                      <td>
                        <div class="biz">
                          <strong>{{ t.name }}</strong>
                          <small class="slug">{{ t.slug }}</small>
                        </div>
                      </td>
                      <td>
                        <app-chip [tone]="statusTone(t.subscription_status)">
                          {{ statusLabel(t.subscription_status) }}
                        </app-chip>
                      </td>
                      <td class="num">
                        <strong>{{ t.usage.raffles_used }}<span class="muted">/{{ t.usage.raffles_max }}</span></strong>
                      </td>
                      <td class="num">
                        {{ t.usage.admins_count + t.usage.sellers_count }}
                      </td>
                      <td>
                        <div class="biz">
                          <strong>{{ t.end_date }}</strong>
                          <small class="muted">{{ daysLabel(t) }}</small>
                        </div>
                      </td>
                      <td class="actions-col">
                        <span class="material-icons chev">chevron_right</span>
                      </td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </section>
      }
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-5); }
    .muted { color: var(--text-muted); font-size: 13px; }

    /* ===================== Hero premium ===================== */
    .hero {
      position: relative;
      padding: var(--s-5) var(--s-4);
      border-radius: var(--r-lg);
      overflow: hidden;
      border: 1px solid var(--border);
      background: var(--bg-surface);
    }
    .hero__bg {
      position: absolute; inset: 0;
      background:
        radial-gradient(circle at 0% 0%, color-mix(in srgb, var(--accent) 22%, transparent), transparent 55%),
        radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--accent) 14%, transparent), transparent 50%);
      pointer-events: none;
    }
    .hero__content {
      position: relative;
      display: flex; justify-content: space-between; align-items: flex-end;
      gap: var(--s-4); flex-wrap: wrap;
    }
    .hero__content h1 {
      font-size: clamp(24px, 3.4vw, 32px);
      margin: 4px 0 6px;
      letter-spacing: -0.02em;
    }
    .hero__lead {
      margin: 0;
      color: var(--text-muted);
      font-size: 14px;
      max-width: 640px;
    }
    .eyebrow {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--accent);
    }

    /* ===================== KPIs premium ===================== */
    .kpi-grid {
      display: grid; gap: var(--s-3);
      grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
    }
    .kpi {
      display: flex; align-items: center; gap: var(--s-3);
      padding: var(--s-3) var(--s-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      transition: transform var(--t-fast), border-color var(--t-fast);
    }
    .kpi:hover { transform: translateY(-2px); border-color: color-mix(in srgb, var(--accent) 50%, var(--border)); }
    .kpi__icon {
      width: 44px; height: 44px;
      display: grid; place-items: center;
      border-radius: var(--r-md);
      background: var(--accent-soft);
      color: var(--accent);
      flex-shrink: 0;
    }
    .kpi__icon .material-icons { font-size: 22px; }
    .kpi__body { display: grid; gap: 2px; }
    .kpi__label {
      font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
      color: var(--text-muted); font-weight: 600;
    }
    .kpi__value {
      font-size: 26px; font-weight: 800;
      font-variant-numeric: tabular-nums; line-height: 1;
      color: var(--text);
    }
    .kpi--accent .kpi__icon { background: var(--accent-soft); color: var(--accent); }
    .kpi--ok     .kpi__icon { background: var(--accent-soft); color: var(--accent); }
    .kpi--warn   .kpi__icon { background: var(--warning-soft); color: var(--warning); }
    .kpi--danger .kpi__icon { background: var(--danger-soft);  color: var(--danger);  }

    /* ===================== Usage ===================== */
    .usage {
      display: grid; gap: var(--s-3);
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    }
    .usage__card {
      padding: var(--s-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      display: grid; gap: var(--s-2);
    }
    .usage__head {
      display: flex; align-items: center; gap: 8px;
      color: var(--text); font-size: 13px;
      padding-bottom: var(--s-2);
      border-bottom: 1px solid var(--border);
      margin-bottom: 4px;
    }
    .usage__head .material-icons { font-size: 18px; color: var(--accent); }
    .usage__row {
      display: flex; justify-content: space-between; align-items: center;
      font-size: 14px;
    }
    .usage__row strong { font-variant-numeric: tabular-nums; }
    .usage__row--total {
      border-top: 1px dashed var(--border);
      padding-top: var(--s-2);
      margin-top: 2px;
      font-weight: 600;
    }
    .usage__row--total strong { font-size: 18px; color: var(--accent); }

    .usage__bar {
      width: 100%; height: 8px;
      background: var(--bg-base);
      border-radius: var(--r-full);
      overflow: hidden;
      margin-top: 4px;
    }
    .usage__bar-fill {
      height: 100%;
      background: linear-gradient(90deg, var(--accent), color-mix(in srgb, var(--accent) 70%, white));
      border-radius: var(--r-full);
      transition: width var(--t-base);
    }

    /* ===================== Bloques con tabla ===================== */
    .block {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid; gap: var(--s-3);
    }
    .block--warn {
      border-color: color-mix(in srgb, var(--warning) 40%, var(--border));
      background: linear-gradient(180deg,
        color-mix(in srgb, var(--warning) 6%, var(--bg-surface)),
        var(--bg-surface));
    }
    .block__head {
      display: flex; justify-content: space-between; align-items: flex-start;
      gap: var(--s-3); flex-wrap: wrap;
    }
    .block__head h2 {
      margin: 0; font-size: 16px;
      display: inline-flex; align-items: center; gap: 8px;
    }
    .block__head h2 .material-icons { color: var(--warning); font-size: 20px; }
    .block__head p { margin: 4px 0 0; }

    .table-wrap {
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow: hidden;
      background: var(--bg-base);
    }
    .table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .table thead th {
      background: var(--bg-surface);
      color: var(--text-muted);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 10px var(--s-3);
      text-align: left;
      border-bottom: 1px solid var(--border);
      white-space: nowrap;
    }
    .table tbody td {
      padding: 12px var(--s-3);
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }
    .table tbody tr:last-child td { border-bottom: 0; }
    .table .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }

    .row-clickable { cursor: pointer; transition: background var(--t-fast); }
    .row-clickable:hover { background: var(--accent-soft); }
    .row-clickable:hover .chev { color: var(--accent); transform: translateX(2px); }

    .biz { display: grid; gap: 2px; }
    .biz strong { font-size: 14px; color: var(--text); }
    .biz .slug { font-family: var(--font-mono); font-size: 11px; color: var(--text-muted); }
    .biz small { font-size: 12px; }

    .actions-col { width: 1%; white-space: nowrap; text-align: right; }
    .chev {
      color: var(--text-muted);
      font-size: 20px;
      transition: transform var(--t-fast), color var(--t-fast);
    }

    @media (max-width: 720px) {
      .table-wrap { overflow-x: auto; }
      .table { min-width: 560px; }
    }
  `],
})
export class SuperAdminDashboardComponent implements OnInit {
  private readonly tenantsSvc = inject(TenantsService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  loading = signal(true);
  tenants = signal<Tenant[]>([]);

  readonly greeting = computed(() => {
    const hour = new Date().getHours();
    const name = this.auth.user()?.full_name?.split(' ')[0] ?? 'Hola';
    if (hour < 12) return `Buenos días, ${name}`;
    if (hour < 19) return `Buenas tardes, ${name}`;
    return `Buenas noches, ${name}`;
  });

  readonly kpis = computed(() => {
    const ts = this.tenants();
    const now = Date.now();
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

  readonly usagePct = computed(() => {
    const u = this.usage();
    return u.rafflesMax ? Math.round((u.rafflesUsed / u.rafflesMax) * 100) : 0;
  });

  readonly attentionList = computed(() =>
    this.tenants().filter((t) =>
      ['grace_period', 'expired', 'suspended'].includes(t.subscription_status) ||
      (t.subscription_status === 'active' &&
        (new Date(t.end_date).getTime() - Date.now()) / 86_400_000 <= 7),
    ),
  );

  ngOnInit(): void {
    this.tenantsSvc.list().subscribe({
      next: (ts) => { this.tenants.set(ts); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  /** Click en fila → /admin/tenants?edit=ID; el componente destino abre el modal. */
  openTenant(t: Tenant) {
    this.router.navigate(['/admin/tenants'], { queryParams: { edit: t.id } });
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
