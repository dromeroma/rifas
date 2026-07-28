/**
 * CustomersListComponent — vista principal del módulo customers.
 *
 * Tabla con búsqueda reactiva + drawer de detalle al hacer click en
 * cualquier fila. El detalle carga on-demand (identities +
 * preferences + consents + wallet snapshot).
 *
 * Loading skeleton para la primera carga. Empty state amable.
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
import { Subject, debounceTime } from 'rxjs';

import {
  CustomerDetail,
  CustomerSummary,
  IdentifyRequest,
  IdentityKind,
  PerksApiError,
  PerksApiService,
  WalletSnapshot,
} from '../../shared/services/perks-api.service';

interface OpenState {
  customer_id: number;
  detail: CustomerDetail | null;
  wallet: WalletSnapshot | null;
  loading: boolean;
  error: string | null;
}

@Component({
  selector: 'perks-customers-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <!-- Head -->
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <h1>Customers</h1>
            <p>Todos los clientes registrados en tu cuenta. Busca, revisa su wallet y gestiona identities/consents.</p>
          </div>
          <div class="p-page-head__actions">
            <label class="p-search">
              <span class="material-icons-outlined">search</span>
              <input
                class="p-input"
                type="search"
                placeholder="Nombre, email, teléfono, documento…"
                [ngModel]="search()"
                (ngModelChange)="onSearchChange($event)"
                autocomplete="off"
              />
            </label>
            <button type="button" class="p-btn p-btn--primary" (click)="openIdentifyForm()">
              <span class="material-icons-outlined">person_add</span>
              Identificar cliente
            </button>
          </div>
        </header>

        <!-- Card / Tabla -->
        <article class="p-card">
          <header class="p-card__head">
            <h2>Todos los customers</h2>
            <span class="p-chip">{{ total() }} total</span>
          </header>

          <div class="p-card__body p-card__body--flush">
            @if (loading()) {
              <div style="padding: var(--p-space-7); display: grid; gap: var(--p-space-4);">
                <div class="p-skeleton" style="height: 42px;"></div>
                <div class="p-skeleton" style="height: 42px;"></div>
                <div class="p-skeleton" style="height: 42px;"></div>
                <div class="p-skeleton" style="height: 42px;"></div>
              </div>
            } @else if (error()) {
              <div class="p-alert p-alert--danger" style="margin: var(--p-space-7);">
                <span class="material-icons-outlined">error_outline</span>
                <div>
                  <div class="p-alert__title">No pudimos cargar los customers</div>
                  <div class="p-alert__body">{{ error() }}</div>
                </div>
              </div>
            } @else if (customers().length === 0) {
              <div class="p-empty">
                <span class="material-icons-outlined p-empty__icon">groups</span>
                <h3 class="p-empty__title">
                  @if (search()) {
                    Sin resultados para "{{ search() }}"
                  } @else {
                    Aún no tienes customers
                  }
                </h3>
                <p class="p-empty__desc">
                  @if (search()) {
                    Intenta con otro nombre, email o teléfono.
                  } @else {
                    Cada compra confirmada o identify manual los registra automáticamente. Puedes crear uno ahora mismo con el botón de arriba.
                  }
                </p>
              </div>
            } @else {
              <div style="overflow-x: auto;">
                <table class="p-table">
                  <thead>
                    <tr>
                      <th style="width: 42%;">Cliente</th>
                      <th>Email</th>
                      <th>Teléfono</th>
                      <th>Documento</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (c of customers(); track c.id) {
                      <tr
                        (click)="openDetail(c.id)"
                        [class.p-table__row--selected]="opened()?.customer_id === c.id"
                      >
                        <td>
                          <div style="display: flex; align-items: center; gap: var(--p-space-5);">
                            <span class="avatar" [attr.aria-hidden]="true">
                              {{ initialsOf(c.full_name) }}
                            </span>
                            <div>
                              <div class="strong">{{ c.full_name || '—' }}</div>
                              <div class="muted" style="font-size: var(--p-text-xs);">
                                #{{ c.id }}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td class="p-mono muted">{{ c.email || '—' }}</td>
                        <td class="p-mono muted">{{ c.phone || '—' }}</td>
                        <td class="p-mono muted">{{ c.document || '—' }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>

              <footer class="pager">
                <span class="p-muted">
                  Mostrando {{ customers().length }} de {{ total() }}
                </span>
                <div style="display: flex; gap: var(--p-space-4);">
                  <button type="button" class="p-btn p-btn--secondary p-btn--sm"
                          [disabled]="offset() === 0"
                          (click)="prevPage()">
                    <span class="material-icons-outlined">chevron_left</span>
                    Anterior
                  </button>
                  <button type="button" class="p-btn p-btn--secondary p-btn--sm"
                          [disabled]="!hasNext()"
                          (click)="nextPage()">
                    Siguiente
                    <span class="material-icons-outlined">chevron_right</span>
                  </button>
                </div>
              </footer>
            }
          </div>
        </article>
      </section>

      <!-- ── Drawer detalle ────────────────────────────── -->
      @if (opened(); as st) {
        <div class="p-backdrop" (click)="closeDetail()"></div>
        <aside class="p-drawer" role="dialog" aria-label="Detalle del customer">
          <header class="p-drawer__head">
            <div>
              <h2>
                {{ st.detail?.full_name || 'Cargando…' }}
              </h2>
              <div class="p-muted" style="font-size: var(--p-text-xs); margin-top: 2px;">
                Customer #{{ st.customer_id }}
              </div>
            </div>
            <button type="button" class="p-icon-btn" (click)="closeDetail()" aria-label="Cerrar">
              <span class="material-icons-outlined">close</span>
            </button>
          </header>

          <div class="p-drawer__body">
            @if (st.loading) {
              <div class="p-skeleton" style="height: 120px;"></div>
              <div class="p-skeleton" style="height: 96px;"></div>
              <div class="p-skeleton" style="height: 96px;"></div>
            } @else if (st.error) {
              <div class="p-alert p-alert--danger">
                <span class="material-icons-outlined">error_outline</span>
                <div class="p-alert__body">{{ st.error }}</div>
              </div>
            } @else if (st.detail) {
              <!-- Wallet snapshot -->
              <section class="p-card p-card--elevated">
                <header class="p-card__head">
                  <h3>Wallet</h3>
                  @if (st.wallet && st.wallet.id > 0) {
                    <span class="p-chip p-chip--brand">
                      {{ st.wallet.active_vouchers }} vouchers activos
                    </span>
                  }
                </header>
                <div class="p-card__body">
                  @if (!st.wallet || st.wallet.id === 0 || st.wallet.balances.length === 0) {
                    <p class="p-muted" style="margin: 0;">
                      Sin actividad en wallet todavía. Se crea al primer evento (regla, compra, campaña).
                    </p>
                  } @else {
                    <div class="balances">
                      @for (b of st.wallet.balances; track b.balance_type) {
                        <div class="balance">
                          <span class="balance__type">{{ humanBalance(b.balance_type) }}</span>
                          <span class="balance__amount">{{ formatAmount(b.amount) }}</span>
                        </div>
                      }
                    </div>
                  }
                </div>
              </section>

              <!-- Identities -->
              <section class="p-card p-card--elevated">
                <header class="p-card__head">
                  <h3>Identities ({{ st.detail.identities.length }})</h3>
                </header>
                <div class="p-card__body">
                  @if (st.detail.identities.length === 0) {
                    <p class="p-muted" style="margin: 0;">Sin identities.</p>
                  } @else {
                    <ul class="ident-list">
                      @for (i of st.detail.identities; track i.id) {
                        <li>
                          <span class="p-chip p-chip--brand">{{ i.kind }}</span>
                          <span class="p-mono">{{ i.value }}</span>
                          @if (i.verified) {
                            <span class="p-chip p-chip--success">verificada</span>
                          }
                        </li>
                      }
                    </ul>
                  }
                </div>
              </section>

              <!-- Preferences -->
              <section class="p-card p-card--elevated">
                <header class="p-card__head">
                  <h3>Preferencias de canales</h3>
                </header>
                <div class="p-card__body">
                  @if (st.detail.preferences.length === 0) {
                    <p class="p-muted" style="margin: 0;">Sin preferencias configuradas.</p>
                  } @else {
                    <ul class="ident-list">
                      @for (p of st.detail.preferences; track p.id) {
                        <li>
                          <span class="p-chip">{{ p.channel }}</span>
                          <span class="p-chip"
                                [class.p-chip--success]="p.allowed"
                                [class.p-chip--danger]="!p.allowed">
                            {{ p.allowed ? 'permitido' : 'opt-out' }}
                          </span>
                        </li>
                      }
                    </ul>
                  }
                </div>
              </section>

              <!-- Consents recientes -->
              @if (st.detail.recent_consents.length > 0) {
                <section class="p-card p-card--elevated">
                  <header class="p-card__head">
                    <h3>Consents recientes</h3>
                  </header>
                  <div class="p-card__body">
                    <ul class="ident-list">
                      @for (c of st.detail.recent_consents; track c.id) {
                        <li>
                          <span class="p-chip"
                                [class.p-chip--success]="c.action === 'granted'"
                                [class.p-chip--danger]="c.action === 'revoked'">
                            {{ c.action }}
                          </span>
                          <span>{{ c.purpose }}</span>
                          <span class="p-muted" style="font-size: var(--p-text-xs);">
                            {{ c.granted_at | date:'short' }}
                          </span>
                        </li>
                      }
                    </ul>
                  </div>
                </section>
              }
            }
          </div>
        </aside>
      }

      <!-- ── Modal identify ────────────────────────────── -->
      @if (identifyOpen()) {
        <div class="p-backdrop" (click)="closeIdentifyForm()"></div>
        <aside class="p-drawer" role="dialog" aria-label="Identificar cliente">
          <header class="p-drawer__head">
            <h2>Identificar cliente</h2>
            <button type="button" class="p-icon-btn" (click)="closeIdentifyForm()">
              <span class="material-icons-outlined">close</span>
            </button>
          </header>
          <div class="p-drawer__body">
            <p class="p-muted" style="margin: 0;">
              Registra un customer nuevo o conecta una identity extra a uno existente. Si el email/teléfono ya está en el sistema, se conserva ese customer.
            </p>

            <div class="p-field">
              <label>Tipo de identidad</label>
              <select class="p-select" [(ngModel)]="identifyForm.kind">
                <option value="email">Email</option>
                <option value="phone">Teléfono</option>
                <option value="document">Documento</option>
                <option value="external">External ID</option>
              </select>
            </div>

            <div class="p-field">
              <label>Valor</label>
              <input class="p-input"
                     [(ngModel)]="identifyForm.value"
                     [placeholder]="placeholderFor(identifyForm.kind)" />
              <span class="p-field__hint">
                Normalizamos automáticamente (lowercase email, sólo dígitos para tel, sin separadores en doc).
              </span>
            </div>

            <div class="p-field">
              <label>Nombre completo <span class="p-muted">(opcional)</span></label>
              <input class="p-input" [(ngModel)]="identifyForm.full_name" placeholder="María Torres" />
            </div>

            @if (identifyError()) {
              <div class="p-alert p-alert--danger">
                <span class="material-icons-outlined">error_outline</span>
                <div>
                  <div class="p-alert__title">No se pudo identificar</div>
                  <div class="p-alert__body">{{ identifyError() }}</div>
                </div>
              </div>
            }
          </div>
          <footer class="p-drawer__foot">
            <button type="button" class="p-btn p-btn--ghost" (click)="closeIdentifyForm()">Cancelar</button>
            <button type="button"
                    class="p-btn p-btn--primary"
                    [disabled]="identifying() || !identifyForm.value"
                    (click)="submitIdentify()">
              @if (identifying()) {
                <span class="material-icons-outlined">hourglass_top</span>
                Guardando…
              } @else {
                <span class="material-icons-outlined">check</span>
                Identificar
              }
            </button>
          </footer>
        </aside>
      }
    </div>
  `,
  styles: [`
    :host { display: block; }

    .avatar {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px;
      background: var(--p-brand-primary-soft);
      color: var(--p-brand-primary);
      border-radius: var(--p-radius-full);
      font-size: 11px;
      font-weight: var(--p-weight-semibold);
    }

    .pager {
      display: flex; align-items: center; justify-content: space-between;
      padding: var(--p-space-5) var(--p-space-7);
      border-top: 1px solid var(--p-border-subtle);
      font-size: var(--p-text-sm);
    }

    .balances {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: var(--p-space-5);
    }
    .balance {
      display: grid; gap: var(--p-space-3);
      padding: var(--p-space-5) var(--p-space-6);
      background: var(--p-surface-inset);
      border-radius: var(--p-radius-md);
    }
    .balance__type {
      font-size: var(--p-text-xs);
      color: var(--p-text-muted);
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: var(--p-weight-semibold);
    }
    .balance__amount {
      font-size: var(--p-text-xl);
      color: var(--p-brand-primary);
      font-weight: var(--p-weight-semibold);
      font-variant-numeric: tabular-nums;
    }

    .ident-list {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: var(--p-space-4);
    }
    .ident-list li {
      display: flex; align-items: center; gap: var(--p-space-4);
      flex-wrap: wrap;
    }
  `],
})
export class CustomersListComponent {
  private readonly api = inject(PerksApiService);

  readonly search = signal('');
  readonly customers = signal<CustomerSummary[]>([]);
  readonly total = signal(0);
  readonly limit = signal(25);
  readonly offset = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly opened = signal<OpenState | null>(null);

  readonly identifyOpen = signal(false);
  readonly identifying = signal(false);
  readonly identifyError = signal<string | null>(null);
  identifyForm = {
    kind: 'email' as IdentityKind,
    value: '',
    full_name: '',
  };

  readonly hasNext = computed(() =>
    this.offset() + this.customers().length < this.total(),
  );

  private readonly searchDebounce$ = new Subject<string>();

  constructor() {
    this.searchDebounce$
      .pipe(debounceTime(250))
      .subscribe(() => {
        this.offset.set(0);
        this.fetch();
      });

    this.fetch();
  }

  onSearchChange(v: string): void {
    this.search.set(v);
    this.searchDebounce$.next(v);
  }

  reload(): void { this.fetch(); }

  private fetch(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .listCustomers({
        q: this.search() || undefined,
        limit: this.limit(),
        offset: this.offset(),
      })
      .subscribe({
        next: (res) => {
          this.customers.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: (err: PerksApiError) => {
          this.error.set(err?.userMessage ?? 'Error de red');
          this.loading.set(false);
        },
      });
  }

  nextPage(): void {
    this.offset.set(this.offset() + this.limit());
    this.reload();
  }

  prevPage(): void {
    this.offset.set(Math.max(0, this.offset() - this.limit()));
    this.reload();
  }

  openDetail(id: number): void {
    this.opened.set({
      customer_id: id, detail: null, wallet: null,
      loading: true, error: null,
    });
    this.api.getCustomer(id).subscribe({
      next: (detail) => {
        const state = this.opened();
        if (state?.customer_id !== id) return;
        this.opened.set({ ...state, detail, loading: false });
        // Load wallet in parallel
        this.api.getWallet(id).subscribe({
          next: (wallet) => {
            const st = this.opened();
            if (st?.customer_id === id) this.opened.set({ ...st, wallet });
          },
          error: () => {/* ignoramos error de wallet */},
        });
      },
      error: (err: PerksApiError) => {
        this.opened.set({
          customer_id: id, detail: null, wallet: null, loading: false,
          error: err.userMessage ?? 'Error al cargar el detalle',
        });
      },
    });
  }

  closeDetail(): void { this.opened.set(null); }

  openIdentifyForm(): void {
    this.identifyForm = { kind: 'email', value: '', full_name: '' };
    this.identifyError.set(null);
    this.identifyOpen.set(true);
  }

  closeIdentifyForm(): void {
    if (this.identifying()) return;
    this.identifyOpen.set(false);
  }

  submitIdentify(): void {
    const payload: IdentifyRequest = {
      identity: {
        kind: this.identifyForm.kind,
        value: this.identifyForm.value.trim(),
      },
      full_name: this.identifyForm.full_name.trim() || undefined,
      source: 'perks_admin_ui',
    };
    this.identifying.set(true);
    this.identifyError.set(null);
    this.api.identify(payload).subscribe({
      next: (result) => {
        this.identifying.set(false);
        this.identifyOpen.set(false);
        this.reload();
        // Abre el detalle del customer creado/encontrado.
        this.openDetail(result.customer_id);
      },
      error: (err: PerksApiError) => {
        this.identifyError.set(err.userMessage ?? 'Error al identificar');
        this.identifying.set(false);
      },
    });
  }

  initialsOf(name: string | null | undefined): string {
    if (!name) return '·';
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '·';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  humanBalance(bt: string): string {
    const map: Record<string, string> = {
      points: 'Puntos',
      xp: 'XP',
      cashback_cop: 'Cashback (COP)',
      credit_seconds: 'Segundos crédito',
      visits: 'Visitas',
      stamps: 'Sellos',
    };
    return map[bt] ?? bt;
  }

  formatAmount(amount: string | number): string {
    const n = typeof amount === 'string' ? Number(amount) : amount;
    if (Number.isNaN(n)) return String(amount);
    return new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 2,
    }).format(n);
  }

  placeholderFor(kind: IdentityKind): string {
    return {
      email: 'ana@correo.com',
      phone: '+57 300 123 4567',
      document: '12345678',
      external: 'shopify_abc123',
    }[kind];
  }
}
