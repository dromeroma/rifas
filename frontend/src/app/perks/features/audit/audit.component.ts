/**
 * AuditComponent — bitácora inmutable de acciones administrativas.
 *
 * Feed cronológico paginado con filtros por:
 *   · módulo (action prefix): rules / notifications / tenant / onboarding
 *   · severity: info / notice / warn / critical
 *   · texto libre en resource_id (search by resource)
 *
 * Cada fila expande al click para mostrar el diff (`changes`) formateado.
 * Ideal para "quién cambió esta regla" o "por qué esto está pausado".
 */
import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import {
  AuditLogItem,
  AuditSeverity,
  PerksApiError,
  PerksApiService,
} from '../../shared/services/perks-api.service';
import { PerksToastService } from '../../shared/services/perks-toast.service';

const MODULE_PREFIXES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos los módulos' },
  { value: 'tenant.', label: 'Tenant' },
  { value: 'rules.', label: 'Rules' },
  { value: 'notifications.', label: 'Notifications' },
  { value: 'onboarding.', label: 'Onboarding' },
  { value: 'customer.', label: 'Customer' },
  { value: 'wallet.', label: 'Wallet' },
];

const SEVERITIES: Array<{ value: AuditSeverity | ''; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'info', label: 'Info' },
  { value: 'notice', label: 'Notice' },
  { value: 'warn', label: 'Warn' },
  { value: 'critical', label: 'Critical' },
];

@Component({
  selector: 'perks-audit',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <h1>Audit log</h1>
            <p>
              Bitácora inmutable de cambios administrativos. Cada acción
              disparada desde el panel queda registrada acá con actor,
              recurso, diff y severidad.
            </p>
          </div>
          <div class="p-page-head__actions">
            <button type="button" class="p-btn p-btn--ghost" (click)="refresh()">
              <span class="material-icons-outlined">refresh</span>
              Actualizar
            </button>
          </div>
        </header>

        <!-- Filtros -->
        <article class="p-card">
          <div class="p-card__body filters">
            <label class="p-field">
              <span class="p-field__label">Módulo</span>
              <select class="p-input" [(ngModel)]="modulePrefix"
                      (ngModelChange)="reload()">
                @for (m of modules; track m.value) {
                  <option [ngValue]="m.value">{{ m.label }}</option>
                }
              </select>
            </label>

            <label class="p-field">
              <span class="p-field__label">Severidad</span>
              <select class="p-input" [(ngModel)]="severity"
                      (ngModelChange)="reload()">
                @for (s of severities; track s.value) {
                  <option [ngValue]="s.value">{{ s.label }}</option>
                }
              </select>
            </label>

            <label class="p-field" style="flex: 1; min-width: 220px;">
              <span class="p-field__label">Recurso (id)</span>
              <input class="p-input" type="text"
                     placeholder="ej: 42, rule_v1_abc"
                     [(ngModel)]="resourceId"
                     (ngModelChange)="onResourceChange($event)" />
            </label>
          </div>
        </article>

        <!-- Feed -->
        <article class="p-card">
          <header class="p-card__head">
            <h2>Entradas</h2>
            <span class="p-chip">{{ entries().length }} cargadas</span>
          </header>

          <div class="p-card__body p-card__body--flush">
            @if (loading()) {
              <div style="padding: var(--p-space-7); display: grid; gap: var(--p-space-4);">
                <div class="p-skeleton" style="height: 32px;"></div>
                <div class="p-skeleton" style="height: 32px;"></div>
                <div class="p-skeleton" style="height: 32px;"></div>
              </div>
            } @else if (error()) {
              <div class="p-alert p-alert--danger" style="margin: var(--p-space-7);">
                <span class="material-icons-outlined">error_outline</span>
                <div>
                  <div class="p-alert__title">No pudimos cargar el audit log</div>
                  <div class="p-alert__body">{{ error() }}</div>
                </div>
              </div>
            } @else if (entries().length === 0) {
              <div class="p-empty">
                <span class="material-icons-outlined p-empty__icon">gavel</span>
                <h3 class="p-empty__title">Sin registros que mostrar</h3>
                <p class="p-empty__body">
                  Cuando dispares acciones desde el panel (crear reglas, editar
                  la marca, activar el tenant), van a aparecer acá con el
                  detalle completo.
                </p>
              </div>
            } @else {
              <ul class="log">
                @for (row of entries(); track row.id) {
                  <li class="log__row"
                      [attr.data-severity]="row.severity"
                      [class.log__row--expanded]="expanded() === row.id">
                    <button type="button" class="log__head"
                            (click)="toggle(row.id)">
                      <div class="log__marker">
                        <span class="log__sev" [class]="sevChipClass(row.severity)">
                          {{ row.severity }}
                        </span>
                      </div>
                      <div class="log__body">
                        <div class="log__title">
                          <strong>{{ row.action }}</strong>
                          @if (row.resource_kind) {
                            <span class="log__res">
                              on {{ row.resource_kind }}#{{ row.resource_id }}
                            </span>
                          }
                        </div>
                        <div class="log__meta">
                          <span>
                            <span class="material-icons-outlined" style="font-size: 14px;">
                              person
                            </span>
                            {{ row.actor_label }}
                          </span>
                          <time>{{ formatWhen(row.occurred_at) }}</time>
                        </div>
                      </div>
                      <span class="material-icons-outlined log__chevron">
                        {{ expanded() === row.id ? 'expand_less' : 'expand_more' }}
                      </span>
                    </button>

                    @if (expanded() === row.id) {
                      <div class="log__detail">
                        <div class="log__detail-grid">
                          <div>
                            <span class="log__label">event_id</span>
                            <code>{{ row.source_event_id || '—' }}</code>
                          </div>
                          <div>
                            <span class="log__label">trigger</span>
                            <code>{{ row.trigger_event_id || '—' }}</code>
                          </div>
                          <div>
                            <span class="log__label">created</span>
                            <span>{{ row.created_at | date: 'short' }}</span>
                          </div>
                        </div>
                        @if (row.reason) {
                          <div class="log__reason">
                            <span class="log__label">Razón</span>
                            <p>{{ row.reason }}</p>
                          </div>
                        }
                        <div>
                          <span class="log__label">changes</span>
                          <pre class="log__diff">{{ formatChanges(row.changes) }}</pre>
                        </div>
                      </div>
                    }
                  </li>
                }
              </ul>

              @if (hasMore()) {
                <div style="padding: var(--p-space-6); text-align: center;">
                  <button type="button" class="p-btn p-btn--ghost"
                          [disabled]="loadingMore()"
                          (click)="loadMore()">
                    @if (loadingMore()) {
                      <span class="material-icons-outlined">progress_activity</span>
                      Cargando…
                    } @else {
                      Cargar más
                    }
                  </button>
                </div>
              }
            }
          </div>
        </article>
      </section>
    </div>
  `,
  styles: [`
    .filters {
      display: flex;
      gap: var(--p-space-5);
      flex-wrap: wrap;
      align-items: flex-end;
    }

    .log { list-style: none; margin: 0; padding: 0; }
    .log__row {
      border-bottom: 1px solid var(--p-border-subtle);
    }
    .log__row:last-child { border-bottom: none; }
    .log__row[data-severity="warn"] { background: linear-gradient(
      to right, var(--p-state-warning-soft) 3px, transparent 3px); }
    .log__row[data-severity="critical"] { background: linear-gradient(
      to right, var(--p-state-danger) 3px, transparent 3px); }
    .log__row[data-severity="notice"] { background: linear-gradient(
      to right, var(--p-brand-primary) 3px, transparent 3px); }

    .log__head {
      display: grid;
      grid-template-columns: 80px 1fr 32px;
      gap: var(--p-space-5);
      padding: var(--p-space-5) var(--p-space-7);
      align-items: center;
      background: none;
      border: none;
      cursor: pointer;
      text-align: left;
      font: inherit;
      color: inherit;
      width: 100%;
      transition: background var(--p-motion-fast) var(--p-ease-out);
    }
    .log__head:hover { background: var(--p-surface-hover); }
    .log__marker { display: flex; align-items: center; }
    .log__body { min-width: 0; }
    .log__title strong {
      color: var(--p-text-primary);
      font-weight: var(--p-weight-medium);
      font-family: var(--p-font-mono);
      font-size: var(--p-text-sm);
    }
    .log__res {
      color: var(--p-text-muted);
      font-size: var(--p-text-xs);
      margin-left: var(--p-space-3);
      font-family: var(--p-font-mono);
    }
    .log__meta {
      display: flex; gap: var(--p-space-5); align-items: center;
      color: var(--p-text-secondary);
      font-size: var(--p-text-xs);
      margin-top: 2px;
    }
    .log__meta span {
      display: inline-flex; gap: 4px; align-items: center;
    }
    .log__meta time { color: var(--p-text-muted); }
    .log__chevron { color: var(--p-text-muted); font-size: 20px; }

    .log__sev {
      display: inline-flex; align-items: center;
      padding: 2px var(--p-space-3);
      border-radius: var(--p-radius-sm);
      font-size: 10px;
      font-weight: var(--p-weight-semibold);
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .log__sev--info { background: var(--p-surface-inset); color: var(--p-text-secondary); }
    .log__sev--notice { background: var(--p-brand-primary-soft); color: var(--p-brand-primary); }
    .log__sev--warn { background: var(--p-state-warning-soft); color: var(--p-state-warning); }
    .log__sev--critical { background: var(--p-state-danger-soft); color: var(--p-state-danger); }

    .log__detail {
      padding: var(--p-space-5) var(--p-space-7) var(--p-space-7) 100px;
      background: var(--p-surface-inset);
      border-top: 1px solid var(--p-border-subtle);
    }
    .log__detail-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: var(--p-space-5);
      margin-bottom: var(--p-space-5);
    }
    .log__detail-grid > div {
      display: grid; gap: var(--p-space-3);
    }
    .log__label {
      color: var(--p-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-size: 10px;
    }
    .log__detail code {
      font-family: var(--p-font-mono);
      font-size: var(--p-text-xs);
      color: var(--p-text-primary);
    }
    .log__reason {
      margin-bottom: var(--p-space-5);
    }
    .log__reason p {
      margin: var(--p-space-3) 0 0;
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
    }
    .log__diff {
      margin: var(--p-space-3) 0 0;
      padding: var(--p-space-4);
      background: var(--p-surface-card);
      border-radius: var(--p-radius-sm);
      font-family: var(--p-font-mono);
      font-size: 11px;
      color: var(--p-text-secondary);
      max-height: 240px;
      overflow: auto;
      border: 1px solid var(--p-border-subtle);
    }
  `],
})
export class AuditComponent {
  private readonly api = inject(PerksApiService);
  private readonly toast = inject(PerksToastService);

  readonly modules = MODULE_PREFIXES;
  readonly severities = SEVERITIES;

  modulePrefix = '';
  severity: AuditSeverity | '' = '';
  resourceId = '';

  private resourceDebounce?: ReturnType<typeof setTimeout>;

  readonly entries = signal<AuditLogItem[]>([]);
  readonly loading = signal<boolean>(true);
  readonly loadingMore = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly nextBeforeId = signal<number | null>(null);
  readonly hasMore = computed(() => this.nextBeforeId() !== null);

  readonly expanded = signal<number | null>(null);

  constructor() {
    this.reload();
  }

  sevChipClass(sev: AuditSeverity): string {
    return `log__sev log__sev--${sev}`;
  }

  toggle(id: number): void {
    this.expanded.set(this.expanded() === id ? null : id);
  }

  onResourceChange(_value: string): void {
    if (this.resourceDebounce) clearTimeout(this.resourceDebounce);
    this.resourceDebounce = setTimeout(() => this.reload(), 350);
  }

  refresh(): void {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.nextBeforeId.set(null);
    this.api.getAuditLog({
      limit: 50,
      action_prefix: this.modulePrefix || undefined,
      severity: (this.severity as AuditSeverity) || undefined,
      resource_id: this.resourceId.trim() || undefined,
    }).subscribe({
      next: (r) => {
        this.entries.set(r.items);
        this.nextBeforeId.set(r.next_before_id);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err instanceof PerksApiError ? err.userMessage : 'Error de red',
        );
      },
    });
  }

  loadMore(): void {
    const cursor = this.nextBeforeId();
    if (cursor === null || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.api.getAuditLog({
      limit: 50,
      before_id: cursor,
      action_prefix: this.modulePrefix || undefined,
      severity: (this.severity as AuditSeverity) || undefined,
      resource_id: this.resourceId.trim() || undefined,
    }).subscribe({
      next: (r) => {
        this.entries.set([...this.entries(), ...r.items]);
        this.nextBeforeId.set(r.next_before_id);
        this.loadingMore.set(false);
      },
      error: () => this.loadingMore.set(false),
    });
  }

  formatWhen(iso: string): string {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const s = Math.floor(diff / 1000);
    if (s < 60) return `hace ${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `hace ${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `hace ${h}h`;
    return d.toLocaleString('es-CO', {
      day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  formatChanges(changes: unknown): string {
    try {
      return JSON.stringify(changes, null, 2);
    } catch {
      return String(changes);
    }
  }
}
