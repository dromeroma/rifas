/**
 * ActivityComponent — feed live + panel de KPIs + leaderboard + canales.
 *
 * Vista "todo lo que está pasando en Perks ahora". La primera carga
 * trae KPIs + primeros 50 eventos + top rules + channels breakdown.
 * Scroll-infinito (botón "Cargar más") con keyset pagination.
 *
 * Filtros: window (1h/24h/7d/30d) que refresca KPIs y agregados;
 * type_prefix + subject_kind para acotar el feed de eventos.
 *
 * Drawer lateral: al click en un evento con actor/subject conocido,
 * abre timeline unificado del customer.
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
  ActivityItem,
  AnalyticsWindow,
  ChannelStat,
  KpisResponse,
  PerksApiError,
  PerksApiService,
  RuleStat,
  TimelineEntry,
  TimelineResponse,
} from '../../shared/services/perks-api.service';
import { PerksToastService } from '../../shared/services/perks-toast.service';

const WINDOWS: Array<{ value: AnalyticsWindow; label: string }> = [
  { value: '1h', label: '1 hora' },
  { value: '24h', label: '24 horas' },
  { value: '7d', label: '7 días' },
  { value: '30d', label: '30 días' },
];

const TYPE_PREFIXES: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos los módulos' },
  { value: 'customer.', label: 'Customer' },
  { value: 'wallet.', label: 'Wallet' },
  { value: 'rules.', label: 'Rules' },
  { value: 'notifications.', label: 'Notifications' },
  { value: 'onboarding.', label: 'Onboarding' },
  { value: 'tenant.', label: 'Tenant' },
];

interface TimelineState {
  customer_id: number;
  data: TimelineResponse | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'perks-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <h1>Activity</h1>
            <p>
              Todo lo que está pasando en tu Perks ahora mismo. Filtrá por
              módulo o clic un evento para abrir el timeline del customer.
            </p>
          </div>
          <div class="p-page-head__actions">
            <label class="p-field" style="min-width: 140px;">
              <select class="p-input" [(ngModel)]="window" (ngModelChange)="refreshAll()">
                @for (w of windows; track w.value) {
                  <option [ngValue]="w.value">{{ w.label }}</option>
                }
              </select>
            </label>
          </div>
        </header>

        <!-- ── KPIs ─────────────────────────────────────── -->
        <div class="kpi-grid">
          @if (kpisLoading()) {
            <div class="p-skeleton" style="height: 90px;"></div>
            <div class="p-skeleton" style="height: 90px;"></div>
            <div class="p-skeleton" style="height: 90px;"></div>
            <div class="p-skeleton" style="height: 90px;"></div>
          } @else if (kpis(); as k) {
            <article class="p-card kpi">
              <div class="kpi__label">Eventos en ventana</div>
              <div class="kpi__value">{{ k.events_in_window }}</div>
              <div class="kpi__hint">{{ topEventsHint(k) }}</div>
            </article>
            <article class="p-card kpi">
              <div class="kpi__label">Reglas disparadas</div>
              <div class="kpi__value">{{ k.executions_fired }}</div>
              <div class="kpi__hint">
                <span [class.p-chip--warning]="k.executions_errored > 0"
                      class="p-chip">
                  {{ k.executions_errored }} errored
                </span>
                <span class="p-chip">{{ k.executions_skipped }} skipped</span>
              </div>
            </article>
            <article class="p-card kpi">
              <div class="kpi__label">Notificaciones enviadas</div>
              <div class="kpi__value">
                {{ k.notifications_delivered + k.notifications_sent }}
              </div>
              <div class="kpi__hint">
                @if (k.notifications_failed > 0) {
                  <span class="p-chip p-chip--danger">
                    {{ k.notifications_failed }} failed
                  </span>
                }
                @if (k.notifications_blocked > 0) {
                  <span class="p-chip">{{ k.notifications_blocked }} blocked</span>
                }
              </div>
            </article>
            <article class="p-card kpi">
              <div class="kpi__label">Wallet activity</div>
              <div class="kpi__value">+{{ k.wallet_points_credited }}</div>
              <div class="kpi__hint">
                −{{ k.wallet_points_debited }} debitados ·
                {{ k.customers_new_in_window }} clientes nuevos
              </div>
            </article>
          }
        </div>

        <div class="two-col">
          <!-- ── Activity feed ─────────────────────────── -->
          <article class="p-card feed">
            <header class="p-card__head">
              <h2>Feed de eventos</h2>
              <div style="display: flex; gap: var(--p-space-3);">
                <select class="p-input" [(ngModel)]="typePrefix" (ngModelChange)="reloadFeed()">
                  @for (t of typePrefixes; track t.value) {
                    <option [ngValue]="t.value">{{ t.label }}</option>
                  }
                </select>
              </div>
            </header>
            <div class="p-card__body p-card__body--flush">
              @if (feedLoading()) {
                <div style="padding: var(--p-space-7); display: grid; gap: var(--p-space-4);">
                  <div class="p-skeleton" style="height: 32px;"></div>
                  <div class="p-skeleton" style="height: 32px;"></div>
                  <div class="p-skeleton" style="height: 32px;"></div>
                </div>
              } @else if (feed().length === 0) {
                <div class="p-empty">
                  <span class="material-icons-outlined p-empty__icon">
                    timeline
                  </span>
                  <h3 class="p-empty__title">Todavía no hay eventos</h3>
                  <p class="p-empty__body">
                    Cuando identifiques un cliente, dispares una regla o mandes
                    una notificación, van a aparecer acá.
                  </p>
                </div>
              } @else {
                <ul class="feed__list">
                  @for (evt of feed(); track evt.id) {
                    <li class="feed__row"
                        [class.feed__row--clickable]="canOpenTimeline(evt)"
                        (click)="onEventClick(evt)">
                      <div class="feed__type">
                        <span class="p-chip" [class]="chipToneFor(evt.type)">
                          {{ evt.type }}
                        </span>
                      </div>
                      <div class="feed__meta">
                        <div class="feed__subject">
                          @if (evt.subject_kind) {
                            <span class="feed__label">{{ evt.subject_kind }}</span>
                            <span class="feed__sep">#{{ evt.subject_id }}</span>
                          }
                          @if (evt.actor_kind) {
                            <span class="feed__actor">
                              by {{ evt.actor_kind }}
                              @if (evt.actor_id) {
                                <span>:{{ evt.actor_id }}</span>
                              }
                            </span>
                          }
                        </div>
                        <time class="feed__time">
                          {{ formatWhen(evt.occurred_at) }}
                        </time>
                      </div>
                    </li>
                  }
                </ul>
                @if (feedHasMore()) {
                  <div style="padding: var(--p-space-6); text-align: center;">
                    <button type="button" class="p-btn p-btn--ghost"
                            [disabled]="feedLoadingMore()"
                            (click)="loadMore()">
                      @if (feedLoadingMore()) {
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

          <!-- ── Side stats ────────────────────────────── -->
          <div class="side-stack">
            <!-- Rules leaderboard -->
            <article class="p-card">
              <header class="p-card__head">
                <h2>Top reglas</h2>
                <span class="p-chip">{{ leaderboard()?.rules?.length ?? 0 }}</span>
              </header>
              <div class="p-card__body p-card__body--flush">
                @if (leaderboard(); as lb) {
                  @if (lb.rules.length === 0) {
                    <div class="p-empty p-empty--slim">
                      <p class="p-empty__body">
                        Sin reglas disparadas en {{ windowLabel() }}.
                      </p>
                    </div>
                  } @else {
                    <ul class="rank">
                      @for (r of lb.rules; track r.rule_id; let i = $index) {
                        <li class="rank__row">
                          <span class="rank__pos">{{ i + 1 }}</span>
                          <div class="rank__body">
                            <div class="rank__name">{{ r.name }}</div>
                            <div class="rank__meta">
                              <span>{{ r.fires }} fires</span>
                              @if (r.errored > 0) {
                                <span class="p-chip p-chip--danger">
                                  {{ percentOf(r.error_rate) }}% error
                                </span>
                              }
                              @if (r.avg_latency_ms != null) {
                                <span class="rank__lat">
                                  {{ r.avg_latency_ms | number: '1.0-0' }}ms
                                </span>
                              }
                            </div>
                          </div>
                        </li>
                      }
                    </ul>
                  }
                }
              </div>
            </article>

            <!-- Channels breakdown -->
            <article class="p-card">
              <header class="p-card__head">
                <h2>Canales</h2>
              </header>
              <div class="p-card__body">
                @if (channels(); as ch) {
                  @if (ch.channels.length === 0) {
                    <p class="p-empty__body" style="margin: 0;">
                      Sin envíos en {{ windowLabel() }}.
                    </p>
                  } @else {
                    <ul class="channel-list">
                      @for (c of ch.channels; track c.channel) {
                        <li class="channel">
                          <div class="channel__head">
                            <span class="channel__name">{{ c.channel }}</span>
                            <span class="channel__rate">
                              {{ percentOf(c.success_rate) }}% éxito
                            </span>
                          </div>
                          <div class="channel__bar">
                            <span class="channel__seg channel__seg--delivered"
                                  [style.flex]="c.delivered"></span>
                            <span class="channel__seg channel__seg--sent"
                                  [style.flex]="c.sent"></span>
                            <span class="channel__seg channel__seg--failed"
                                  [style.flex]="c.failed"></span>
                            <span class="channel__seg channel__seg--blocked"
                                  [style.flex]="c.blocked"></span>
                          </div>
                          <div class="channel__legend">
                            <span>{{ c.delivered }} delivered</span>
                            <span>{{ c.sent }} sent</span>
                            @if (c.failed > 0) {
                              <span class="channel__failed">{{ c.failed }} failed</span>
                            }
                            @if (c.blocked > 0) {
                              <span>{{ c.blocked }} blocked</span>
                            }
                          </div>
                        </li>
                      }
                    </ul>
                  }
                }
              </div>
            </article>
          </div>
        </div>
      </section>

      <!-- ── Timeline drawer ─────────────────────────── -->
      @if (timeline(); as tl) {
        <div class="p-drawer-backdrop" (click)="closeTimeline()"></div>
        <aside class="p-drawer">
          <header class="p-drawer__head">
            <div>
              <span class="p-chip">customer</span>
              <h2>#{{ tl.customer_id }}</h2>
            </div>
            <button type="button" class="p-icon-btn" (click)="closeTimeline()">
              <span class="material-icons-outlined">close</span>
            </button>
          </header>
          <div class="p-drawer__body">
            @if (tl.loading) {
              <div class="p-skeleton" style="height: 40px;"></div>
              <div class="p-skeleton" style="height: 40px; margin-top: var(--p-space-4);"></div>
            } @else if (tl.error) {
              <div class="p-alert p-alert--danger">{{ tl.error }}</div>
            } @else if (tl.data) {
              @if (tl.data.entries.length === 0) {
                <p class="p-empty__body">Sin actividad reciente para este customer.</p>
              } @else {
                <ol class="timeline">
                  @for (e of tl.data.entries; track $index) {
                    <li class="timeline__row" [attr.data-kind]="e.kind">
                      <span class="timeline__dot"></span>
                      <div class="timeline__body">
                        <div class="timeline__head">
                          <strong>{{ e.title }}</strong>
                          <time>{{ formatWhen(e.when) }}</time>
                        </div>
                        @if (e.subtitle) {
                          <div class="timeline__sub">{{ e.subtitle }}</div>
                        }
                        <pre class="timeline__payload">{{ formatPayload(e.payload) }}</pre>
                      </div>
                    </li>
                  }
                </ol>
              }
            }
          </div>
        </aside>
      }
    </div>
  `,
  styles: [`
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--p-space-5);
    }
    .kpi { padding: var(--p-space-6); display: grid; gap: var(--p-space-3); }
    .kpi__label {
      color: var(--p-text-muted);
      font-size: var(--p-text-xs);
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    .kpi__value {
      font-size: var(--p-text-3xl, 28px);
      font-weight: var(--p-weight-semibold);
      color: var(--p-text-primary);
      line-height: 1;
    }
    .kpi__hint {
      display: flex; flex-wrap: wrap; gap: var(--p-space-3);
      color: var(--p-text-secondary);
      font-size: var(--p-text-xs);
    }

    .two-col {
      display: grid;
      grid-template-columns: minmax(0, 3fr) minmax(280px, 1fr);
      gap: var(--p-space-6);
    }
    @media (max-width: 900px) {
      .two-col { grid-template-columns: 1fr; }
    }
    .side-stack { display: grid; gap: var(--p-space-6); align-content: start; }

    .feed__list {
      list-style: none; margin: 0; padding: 0;
    }
    .feed__row {
      display: grid;
      grid-template-columns: minmax(140px, 240px) 1fr;
      gap: var(--p-space-5);
      padding: var(--p-space-5) var(--p-space-7);
      border-bottom: 1px solid var(--p-border-subtle);
      align-items: center;
    }
    .feed__row:last-child { border-bottom: none; }
    .feed__row--clickable {
      cursor: pointer;
      transition: background var(--p-motion-fast) var(--p-ease-out);
    }
    .feed__row--clickable:hover { background: var(--p-surface-hover); }
    .feed__meta {
      display: flex; justify-content: space-between; align-items: center;
      gap: var(--p-space-5);
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
    }
    .feed__subject { display: inline-flex; gap: var(--p-space-3); align-items: baseline; }
    .feed__label { color: var(--p-text-primary); font-weight: var(--p-weight-medium); }
    .feed__sep { color: var(--p-text-muted); font-family: var(--p-font-mono); }
    .feed__actor { color: var(--p-text-muted); font-size: var(--p-text-xs); }
    .feed__time { color: var(--p-text-muted); font-size: var(--p-text-xs); white-space: nowrap; }

    .rank { list-style: none; margin: 0; padding: 0; }
    .rank__row {
      display: grid;
      grid-template-columns: 32px 1fr;
      gap: var(--p-space-4);
      padding: var(--p-space-5) var(--p-space-7);
      border-bottom: 1px solid var(--p-border-subtle);
      align-items: center;
    }
    .rank__row:last-child { border-bottom: none; }
    .rank__pos {
      display: inline-flex; align-items: center; justify-content: center;
      width: 26px; height: 26px;
      background: var(--p-brand-primary-soft);
      color: var(--p-brand-primary);
      border-radius: var(--p-radius-full);
      font-weight: var(--p-weight-semibold);
      font-size: var(--p-text-xs);
    }
    .rank__name {
      color: var(--p-text-primary); font-weight: var(--p-weight-medium);
      font-size: var(--p-text-sm);
    }
    .rank__meta {
      display: flex; gap: var(--p-space-3); align-items: center;
      color: var(--p-text-secondary); font-size: var(--p-text-xs);
    }
    .rank__lat { font-family: var(--p-font-mono); color: var(--p-text-muted); }

    .channel-list { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--p-space-5); }
    .channel__head {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: var(--p-space-3);
    }
    .channel__name {
      font-weight: var(--p-weight-medium);
      text-transform: capitalize;
    }
    .channel__rate {
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
    }
    .channel__bar {
      display: flex;
      height: 8px;
      border-radius: var(--p-radius-full);
      overflow: hidden;
      background: var(--p-surface-inset);
    }
    .channel__seg {
      display: block;
      min-width: 0;
    }
    .channel__seg--delivered { background: var(--p-state-success); }
    .channel__seg--sent { background: var(--p-brand-primary); }
    .channel__seg--failed { background: var(--p-state-danger); }
    .channel__seg--blocked { background: var(--p-text-muted); }
    .channel__legend {
      margin-top: var(--p-space-3);
      display: flex; gap: var(--p-space-4);
      color: var(--p-text-muted);
      font-size: var(--p-text-xs);
    }
    .channel__failed { color: var(--p-state-danger); }

    .p-drawer-backdrop {
      position: fixed; inset: 0;
      background: rgba(0, 0, 0, 0.45);
      z-index: 40;
      animation: fadein var(--p-motion-fast) var(--p-ease-out);
    }
    .p-drawer {
      position: fixed; top: 0; right: 0; bottom: 0;
      width: min(520px, 100%);
      background: var(--p-surface-card);
      border-left: 1px solid var(--p-border-subtle);
      z-index: 41;
      display: flex; flex-direction: column;
      animation: slidein var(--p-motion-base) var(--p-ease-out);
    }
    .p-drawer__head {
      display: flex; justify-content: space-between; align-items: center;
      padding: var(--p-space-6) var(--p-space-7);
      border-bottom: 1px solid var(--p-border-subtle);
    }
    .p-drawer__head h2 {
      margin: var(--p-space-3) 0 0;
      font-size: var(--p-text-xl);
    }
    .p-drawer__body {
      padding: var(--p-space-7);
      overflow-y: auto;
      flex: 1;
    }

    .timeline { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--p-space-5); }
    .timeline__row {
      display: grid;
      grid-template-columns: 12px 1fr;
      gap: var(--p-space-4);
      padding-left: var(--p-space-4);
      position: relative;
    }
    .timeline__row::before {
      content: '';
      position: absolute;
      left: 5px; top: 12px; bottom: -18px;
      width: 2px;
      background: var(--p-border-subtle);
    }
    .timeline__row:last-child::before { display: none; }
    .timeline__dot {
      width: 12px; height: 12px;
      border-radius: 50%;
      background: var(--p-brand-primary);
      margin-top: 4px;
      z-index: 1;
    }
    .timeline__row[data-kind="wallet_ledger"] .timeline__dot { background: var(--p-state-success); }
    .timeline__row[data-kind="notification"] .timeline__dot { background: var(--p-brand-accent, var(--p-brand-primary)); }
    .timeline__row[data-kind="rule_exec"] .timeline__dot { background: var(--p-state-warning); }
    .timeline__body { min-width: 0; }
    .timeline__head {
      display: flex; justify-content: space-between; gap: var(--p-space-3);
      align-items: baseline;
    }
    .timeline__head time { color: var(--p-text-muted); font-size: var(--p-text-xs); white-space: nowrap; }
    .timeline__sub {
      color: var(--p-text-secondary);
      font-size: var(--p-text-xs);
      margin-top: 2px;
    }
    .timeline__payload {
      margin: var(--p-space-3) 0 0;
      padding: var(--p-space-3) var(--p-space-4);
      background: var(--p-surface-inset);
      border-radius: var(--p-radius-sm);
      font-family: var(--p-font-mono);
      font-size: 11px;
      max-height: 160px;
      overflow: auto;
      color: var(--p-text-secondary);
    }

    .p-empty--slim { padding: var(--p-space-6); }

    @keyframes fadein {
      from { opacity: 0; } to { opacity: 1; }
    }
    @keyframes slidein {
      from { transform: translateX(100%); } to { transform: translateX(0); }
    }
  `],
})
export class ActivityComponent {
  private readonly api = inject(PerksApiService);
  private readonly toast = inject(PerksToastService);

  readonly windows = WINDOWS;
  readonly typePrefixes = TYPE_PREFIXES;

  window: AnalyticsWindow = '24h';
  typePrefix = '';

  readonly kpis = signal<KpisResponse | null>(null);
  readonly kpisLoading = signal<boolean>(true);

  readonly feed = signal<ActivityItem[]>([]);
  readonly feedLoading = signal<boolean>(true);
  readonly feedLoadingMore = signal<boolean>(false);
  readonly nextBeforeId = signal<number | null>(null);
  readonly feedHasMore = computed(() => this.nextBeforeId() !== null);

  readonly leaderboard = signal<{ rules: RuleStat[] } | null>(null);
  readonly channels = signal<{ channels: ChannelStat[] } | null>(null);

  readonly timeline = signal<TimelineState | null>(null);

  constructor() {
    this.refreshAll();
  }

  windowLabel(): string {
    return WINDOWS.find((w) => w.value === this.window)?.label ?? '';
  }

  topEventsHint(k: KpisResponse): string {
    const entries = Object.entries(k.events_by_type).slice(0, 2);
    if (entries.length === 0) return 'Sin actividad todavía';
    return entries.map(([t, c]) => `${t} (${c})`).join(' · ');
  }

  percentOf(value: number): string {
    return (value * 100).toFixed(0);
  }

  chipToneFor(type: string): string {
    if (type.startsWith('rules.')) return 'p-chip p-chip--warning';
    if (type.startsWith('notifications.')) return 'p-chip p-chip--info';
    if (type.startsWith('wallet.')) return 'p-chip p-chip--success';
    if (type.startsWith('customer.')) return 'p-chip p-chip--brand';
    return 'p-chip';
  }

  canOpenTimeline(evt: ActivityItem): boolean {
    if (evt.subject_kind === 'customer' && evt.subject_id) return true;
    const raw = (evt.data as any)?.customer_id;
    return raw !== undefined && raw !== null;
  }

  onEventClick(evt: ActivityItem): void {
    let customerId: number | null = null;
    if (evt.subject_kind === 'customer' && evt.subject_id) {
      customerId = Number(evt.subject_id);
    } else if ((evt.data as any)?.customer_id != null) {
      customerId = Number((evt.data as any).customer_id);
    }
    if (customerId == null || Number.isNaN(customerId)) return;

    this.openTimeline(customerId);
  }

  openTimeline(customerId: number): void {
    this.timeline.set({
      customer_id: customerId, data: null, loading: true, error: null,
    });
    this.api.getCustomerTimeline(customerId).subscribe({
      next: (data) => this.timeline.set({
        customer_id: customerId, data, loading: false, error: null,
      }),
      error: (err) => this.timeline.set({
        customer_id: customerId, data: null, loading: false,
        error: err instanceof PerksApiError ? err.userMessage : 'Error de red',
      }),
    });
  }

  closeTimeline(): void {
    this.timeline.set(null);
  }

  refreshAll(): void {
    this.loadKpis();
    this.reloadFeed();
    this.loadLeaderboard();
    this.loadChannels();
  }

  private loadKpis(): void {
    this.kpisLoading.set(true);
    this.api.getAnalyticsKpis(this.window).subscribe({
      next: (k) => {
        this.kpis.set(k);
        this.kpisLoading.set(false);
      },
      error: () => this.kpisLoading.set(false),
    });
  }

  reloadFeed(): void {
    this.feedLoading.set(true);
    this.nextBeforeId.set(null);
    this.api.getActivity({
      limit: 50,
      type_prefix: this.typePrefix || undefined,
    }).subscribe({
      next: (r) => {
        this.feed.set(r.items);
        this.nextBeforeId.set(r.next_before_id);
        this.feedLoading.set(false);
      },
      error: (err) => {
        this.feedLoading.set(false);
        this.toast.error(
          err instanceof PerksApiError ? err.userMessage : 'Error de red',
        );
      },
    });
  }

  loadMore(): void {
    const cursor = this.nextBeforeId();
    if (cursor === null || this.feedLoadingMore()) return;
    this.feedLoadingMore.set(true);
    this.api.getActivity({
      limit: 50, before_id: cursor,
      type_prefix: this.typePrefix || undefined,
    }).subscribe({
      next: (r) => {
        this.feed.set([...this.feed(), ...r.items]);
        this.nextBeforeId.set(r.next_before_id);
        this.feedLoadingMore.set(false);
      },
      error: () => this.feedLoadingMore.set(false),
    });
  }

  private loadLeaderboard(): void {
    this.api.getRulesLeaderboard({ window: this.window, limit: 5 }).subscribe({
      next: (r) => this.leaderboard.set(r),
      error: () => this.leaderboard.set({ rules: [] }),
    });
  }

  private loadChannels(): void {
    this.api.getChannelsBreakdown(this.window).subscribe({
      next: (r) => this.channels.set(r),
      error: () => this.channels.set({ channels: [] }),
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

  formatPayload(payload: unknown): string {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }
}
