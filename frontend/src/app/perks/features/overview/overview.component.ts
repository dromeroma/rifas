/**
 * OverviewComponent — dashboard del panel.
 *
 * KPI tiles con contador animado + top rules + últimas ejecuciones +
 * feed de eventos recientes.
 *
 * Es la primera pantalla que el admin ve al entrar a /perks.
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { RouterLink } from '@angular/router';

import {
  OverviewResponse,
  PerksApiError,
  PerksApiService,
} from '../../shared/services/perks-api.service';
import { RollingNumberComponent } from '../../shared/ui/rolling-number.component';

interface TileSpec {
  label: string;
  value: number;
  hint?: string;
  tone: 'brand' | 'success' | 'warning' | 'danger' | 'neutral';
  icon: string;
}

@Component({
  selector: 'perks-overview',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, RouterLink, RollingNumberComponent],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <h1>Overview</h1>
            <p>
              Estado de Perks en las últimas 24 horas y 7 días. Toca cualquier
              tarjeta para ir al detalle.
            </p>
          </div>
        </header>

        @if (loading()) {
          <div class="tiles">
            <div class="p-skeleton tile-skel"></div>
            <div class="p-skeleton tile-skel"></div>
            <div class="p-skeleton tile-skel"></div>
            <div class="p-skeleton tile-skel"></div>
          </div>
        } @else if (error()) {
          <div class="p-alert p-alert--danger">
            <span class="material-icons-outlined">error_outline</span>
            <div>
              <div class="p-alert__title">No pudimos cargar el overview</div>
              <div class="p-alert__body">{{ error() }}</div>
            </div>
          </div>
        } @else if (data(); as d) {
          <!-- ── Tiles ─────────────────────────────────── -->
          <div class="tiles">
            @for (t of tiles(); track t.label) {
              <article class="tile" [attr.data-tone]="t.tone">
                <div class="tile__head">
                  <span class="material-icons-outlined tile__icon">{{ t.icon }}</span>
                  <span class="tile__label">{{ t.label }}</span>
                </div>
                <div class="tile__value">
                  <perks-rolling-number [value]="t.value"></perks-rolling-number>
                </div>
                @if (t.hint) {
                  <div class="tile__hint">{{ t.hint }}</div>
                }
              </article>
            }
          </div>

          <div class="split">
            <!-- ── Top rules ─────────────────────────── -->
            <article class="p-card">
              <header class="p-card__head">
                <h2>Reglas con más disparos (últimos 7 días)</h2>
                <a routerLink="/perks/rules" class="p-btn p-btn--ghost p-btn--sm">
                  Ver todas
                  <span class="material-icons-outlined">arrow_forward</span>
                </a>
              </header>
              <div class="p-card__body p-card__body--flush">
                @if (d.top_rules.length === 0) {
                  <p class="p-muted" style="padding: var(--p-space-7); margin: 0; text-align: center;">
                    Ninguna regla se disparó todavía. Crea tu primera regla
                    para empezar a ver actividad aquí.
                  </p>
                } @else {
                  <ul class="rank-list">
                    @for (r of d.top_rules; track r.rule_id; let i = $index) {
                      <li>
                        <a [routerLink]="['/perks/rules', r.rule_id]">
                          <span class="rank__pos">#{{ i + 1 }}</span>
                          <div class="rank__body">
                            <div class="rank__name">{{ r.name }}</div>
                            <div class="rank__code p-mono">{{ r.code }}</div>
                          </div>
                          <span class="rank__count">
                            {{ r.fires_last_7d }} <span class="p-muted">fires</span>
                          </span>
                        </a>
                      </li>
                    }
                  </ul>
                }
              </div>
            </article>

            <!-- ── Recent executions ─────────────────── -->
            <article class="p-card">
              <header class="p-card__head">
                <h2>Ejecuciones recientes</h2>
                <button type="button" class="p-icon-btn" (click)="load()"
                        [disabled]="loading()"
                        aria-label="Refrescar">
                  <span class="material-icons-outlined">refresh</span>
                </button>
              </header>
              <div class="p-card__body p-card__body--flush">
                @if (d.recent_executions.length === 0) {
                  <p class="p-muted" style="padding: var(--p-space-7); margin: 0; text-align: center;">
                    Sin ejecuciones aún.
                  </p>
                } @else {
                  <ul class="feed">
                    @for (e of d.recent_executions; track e.id) {
                      <li>
                        <span class="feed__dot p-badge p-badge--dot"
                              [class.dot-fired]="e.status === 'fired'"
                              [class.dot-skip]="e.status === 'skipped' || e.status === 'rate_limited' || e.status === 'cooled_down'"
                              [class.dot-err]="e.status === 'errored'"
                              aria-hidden="true"></span>
                        <div class="feed__body">
                          <a class="feed__title"
                             [routerLink]="['/perks/rules', e.rule_id]">
                            {{ e.rule_name }}
                          </a>
                          <div class="feed__meta">
                            <span class="p-mono">{{ e.event_type }}</span>
                            @if (e.customer_id) {
                              <span class="p-muted">·</span>
                              <span class="p-muted">customer #{{ e.customer_id }}</span>
                            }
                            @if (e.latency_ms != null) {
                              <span class="p-muted">·</span>
                              <span class="p-muted">{{ e.latency_ms }} ms</span>
                            }
                          </div>
                        </div>
                        <span class="feed__time p-muted">
                          {{ e.created_at | date:'HH:mm' }}
                        </span>
                      </li>
                    }
                  </ul>
                }
              </div>
            </article>
          </div>

          <!-- ── Feed de eventos ─────────────────────── -->
          <article class="p-card">
            <header class="p-card__head">
              <h2>Últimos eventos del sistema</h2>
              <span class="p-chip">bus interno</span>
            </header>
            <div class="p-card__body p-card__body--flush">
              @if (d.recent_events.length === 0) {
                <p class="p-muted" style="padding: var(--p-space-7); margin: 0; text-align: center;">
                  Sin eventos aún. Se llenará cuando el bus se active y
                  empiecen a fluir customer.identified, wallet.points.credited, etc.
                </p>
              } @else {
                <ul class="feed">
                  @for (ev of d.recent_events; track ev.id) {
                    <li>
                      <span class="feed__dot p-badge p-badge--dot" aria-hidden="true"></span>
                      <div class="feed__body">
                        <div class="feed__title p-mono">{{ ev.type }}</div>
                        <div class="feed__meta">
                          @if (ev.subject_kind) {
                            <span class="p-muted">{{ ev.subject_kind }}#{{ ev.subject_id }}</span>
                          }
                          <span class="p-muted">·</span>
                          <span class="p-mono p-muted" style="font-size: var(--p-text-xs);">
                            {{ ev.event_id }}
                          </span>
                        </div>
                      </div>
                      <span class="feed__time p-muted">
                        {{ ev.occurred_at | date:'HH:mm:ss' }}
                      </span>
                    </li>
                  }
                </ul>
              }
            </div>
          </article>
        }
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }

    /* Tiles */
    .tiles {
      display: grid;
      gap: var(--p-space-6);
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
    .tile-skel { height: 128px; border-radius: var(--p-radius-lg); }

    .tile {
      padding: var(--p-space-6);
      background: var(--p-surface-card);
      border: 1px solid var(--p-border-subtle);
      border-radius: var(--p-radius-lg);
      display: grid; gap: var(--p-space-5);
      opacity: 0; animation: card-in var(--p-motion-slow) var(--p-ease-out) forwards;
    }
    .tile:nth-child(1) { animation-delay: 0ms; }
    .tile:nth-child(2) { animation-delay: 60ms; }
    .tile:nth-child(3) { animation-delay: 120ms; }
    .tile:nth-child(4) { animation-delay: 180ms; }
    @keyframes card-in {
      from { transform: translateY(6px); opacity: 0; }
      to   { transform: translateY(0); opacity: 1; }
    }

    .tile__head {
      display: flex; align-items: center; gap: var(--p-space-4);
    }
    .tile__icon {
      font-size: 18px !important;
      color: var(--p-text-secondary);
    }
    .tile__label {
      font-size: var(--p-text-xs);
      color: var(--p-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: var(--p-weight-semibold);
    }
    .tile__value {
      font-size: var(--p-text-3xl);
      font-weight: var(--p-weight-bold);
      line-height: 1;
      letter-spacing: -0.01em;
      color: var(--p-text-primary);
    }
    .tile__hint {
      font-size: var(--p-text-xs);
      color: var(--p-text-muted);
    }
    .tile[data-tone="brand"] .tile__value { color: var(--p-brand-primary); }
    .tile[data-tone="success"] .tile__value { color: var(--p-state-success); }
    .tile[data-tone="warning"] .tile__value { color: var(--p-state-warning); }
    .tile[data-tone="danger"] .tile__value { color: var(--p-state-danger); }
    .tile[data-tone="brand"] .tile__icon { color: var(--p-brand-primary); }
    .tile[data-tone="success"] .tile__icon { color: var(--p-state-success); }
    .tile[data-tone="warning"] .tile__icon { color: var(--p-state-warning); }
    .tile[data-tone="danger"] .tile__icon { color: var(--p-state-danger); }

    /* Split */
    .split {
      display: grid; gap: var(--p-space-7);
      grid-template-columns: 1fr;
    }
    @media (min-width: 1024px) {
      .split { grid-template-columns: 1fr 1fr; }
    }

    /* Top rules ranking */
    .rank-list {
      list-style: none; padding: 0; margin: 0;
      display: grid;
    }
    .rank-list li a {
      display: grid;
      grid-template-columns: 30px 1fr auto;
      align-items: center;
      gap: var(--p-space-5);
      padding: var(--p-space-5) var(--p-space-7);
      color: var(--p-text-primary);
      text-decoration: none;
      border-bottom: 1px solid var(--p-border-subtle);
      transition: background var(--p-motion-fast) var(--p-ease-out);
    }
    .rank-list li:last-child a { border-bottom: none; }
    .rank-list li a:hover { background: var(--p-surface-hover); }
    .rank__pos {
      font-family: var(--p-font-mono);
      font-size: var(--p-text-sm);
      color: var(--p-text-muted);
      font-weight: var(--p-weight-semibold);
    }
    .rank__body { min-width: 0; }
    .rank__name {
      font-weight: var(--p-weight-semibold);
      color: var(--p-text-primary);
    }
    .rank__code {
      font-size: var(--p-text-xs);
      color: var(--p-text-muted);
    }
    .rank__count {
      font-variant-numeric: tabular-nums;
      font-weight: var(--p-weight-semibold);
      color: var(--p-brand-primary);
    }

    /* Feed (executions + events) */
    .feed {
      list-style: none; padding: 0; margin: 0;
      display: grid;
    }
    .feed li {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      gap: var(--p-space-5);
      padding: var(--p-space-5) var(--p-space-7);
      border-bottom: 1px solid var(--p-border-subtle);
    }
    .feed li:last-child { border-bottom: none; }
    .feed__dot {
      background: var(--p-text-muted);
    }
    .feed__dot.dot-fired { background: var(--p-state-success); }
    .feed__dot.dot-skip { background: var(--p-state-warning); }
    .feed__dot.dot-err { background: var(--p-state-danger); }
    .feed__body { min-width: 0; }
    .feed__title {
      display: block;
      font-size: var(--p-text-md);
      color: var(--p-text-primary);
      font-weight: var(--p-weight-medium);
      text-decoration: none;
    }
    a.feed__title:hover { color: var(--p-brand-primary); }
    .feed__meta {
      margin-top: 2px;
      font-size: var(--p-text-xs);
      display: flex; align-items: center; gap: var(--p-space-3);
    }
    .feed__time {
      font-variant-numeric: tabular-nums;
      font-size: var(--p-text-xs);
    }
  `],
})
export class OverviewComponent {
  private readonly api = inject(PerksApiService);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly data = signal<OverviewResponse | null>(null);

  readonly tiles = computed<TileSpec[]>(() => {
    const d = this.data();
    if (!d) return [];
    return [
      {
        label: 'Customers',
        value: d.counters.customers_total,
        hint: `${d.counters.wallets_total} con wallet`,
        tone: 'brand',
        icon: 'person',
      },
      {
        label: 'Reglas activas',
        value: d.counters.rules_active,
        hint: `${d.counters.rules_total} totales`,
        tone: 'neutral',
        icon: 'bolt',
      },
      {
        label: 'Disparos (7d)',
        value: d.counters.executions_fired_last_7d,
        hint: `${d.counters.executions_last_7d} evaluaciones`,
        tone: 'success',
        icon: 'stream',
      },
      {
        label: 'Errores (7d)',
        value: d.counters.executions_errored_last_7d,
        hint:
          d.counters.executions_errored_last_7d > 0
            ? 'Revisar reglas con fallos'
            : 'Todo estable',
        tone:
          d.counters.executions_errored_last_7d > 0 ? 'danger' : 'success',
        icon: 'notification_important',
      },
    ];
  });

  constructor() {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getOverview().subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: (err: PerksApiError) => {
        this.error.set(err?.userMessage ?? 'Error de red');
        this.loading.set(false);
      },
    });
  }
}
