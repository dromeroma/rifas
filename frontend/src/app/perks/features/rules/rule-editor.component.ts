/**
 * RuleEditorComponent — crea/edita una regla + dry-run inline.
 *
 * Modo `new`:  ruta /perks/rules/new  → crea regla, redirige a /perks/rules/:id
 * Modo `edit`: ruta /perks/rules/:id → carga DSL activo + edita
 *
 * Editor: textarea con JSON crudo (Fase 1 → editor visual llega en V2).
 * A la derecha: dry-run panel con event_type + event_data + customer_id
 * y resultado detallado (paths resueltos, actions planeadas).
 *
 * Guardar valida JSON antes de enviar; el backend valida DSL a fondo
 * y devuelve 422 con `detail.code` estructurado si algo no cuadra.
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
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  DryRunResult,
  ExecutionsResponse,
  PerksApiError,
  PerksApiService,
  RuleDefinition,
  RuleDetail,
  RuleExecutionOut,
} from '../../shared/services/perks-api.service';


// Plantilla mostrada al crear regla nueva — cubre el 80% de casos comunes.
const STARTER_DEFINITION: RuleDefinition = {
  name: 'Bienvenida — 100 pts al primer identify',
  description: 'Al reconocer un cliente por primera vez, le damos 100 pts.',
  category: 'Onboarding',
  trigger: { event: 'customer.identified' },
  conditions: {
    all: [
      { path: 'data.first_time', op: 'eq', value: true },
    ],
  },
  actions: [
    {
      type: 'wallet.credit_points',
      params: { amount: 100, reason: 'welcome' },
    },
  ],
  limits: { per_customer_lifetime: 1 },
  cooldown_seconds: 0,
};


@Component({
  selector: 'perks-rule-editor',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <!-- Head -->
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <div style="display: flex; align-items: center; gap: var(--p-space-4);">
              <a routerLink="/perks/rules" class="p-icon-btn" aria-label="Volver">
                <span class="material-icons-outlined">arrow_back</span>
              </a>
              <h1>{{ isNew() ? 'Nueva regla' : (currentName() || 'Editar regla') }}</h1>
              @if (!isNew() && detail()?.rule; as r) {
                @if (r.enabled) {
                  <span class="p-chip p-chip--success">activa</span>
                } @else {
                  <span class="p-chip">apagada</span>
                }
              }
            </div>
            <p>
              @if (isNew()) {
                Define el trigger, las condiciones y las acciones. Guarda cuando quieras probarla con el dry-run.
              } @else {
                Editar la regla crea una versión nueva. La versión anterior queda archivada para auditoría.
              }
            </p>
          </div>
          <div class="p-page-head__actions">
            @if (!isNew() && detail()?.rule) {
              @if (detail()!.rule.enabled) {
                <button type="button" class="p-btn p-btn--secondary"
                        [disabled]="toggling()"
                        (click)="toggle()">
                  <span class="material-icons-outlined">pause</span>
                  Apagar
                </button>
              } @else {
                <button type="button" class="p-btn p-btn--secondary"
                        [disabled]="toggling()"
                        (click)="toggle()">
                  <span class="material-icons-outlined">play_arrow</span>
                  Activar
                </button>
              }
            }
            <button type="button" class="p-btn p-btn--primary"
                    [disabled]="saving() || !!parseError()"
                    (click)="save()">
              @if (saving()) {
                <span class="material-icons-outlined">hourglass_top</span>
                Guardando…
              } @else {
                <span class="material-icons-outlined">save</span>
                {{ isNew() ? 'Crear regla' : 'Guardar versión nueva' }}
              }
            </button>
          </div>
        </header>

        @if (loadError()) {
          <div class="p-alert p-alert--danger">
            <span class="material-icons-outlined">error_outline</span>
            <div>
              <div class="p-alert__title">No pudimos cargar la regla</div>
              <div class="p-alert__body">{{ loadError() }}</div>
            </div>
          </div>
        }

        @if (saveError()) {
          <div class="p-alert p-alert--danger">
            <span class="material-icons-outlined">error_outline</span>
            <div>
              <div class="p-alert__title">No se pudo guardar</div>
              <div class="p-alert__body">{{ saveError() }}</div>
            </div>
          </div>
        }

        <div class="editor-grid">
          <!-- ── Editor JSON (izquierda) ─────────────── -->
          <article class="p-card">
            <header class="p-card__head">
              <h2>DSL de la regla</h2>
              <span class="p-chip p-mono">JSON</span>
            </header>
            <div class="p-card__body" style="display: grid; gap: var(--p-space-5);">
              @if (isNew()) {
                <div class="p-field">
                  <label>Código de la regla</label>
                  <input class="p-input p-mono"
                         [(ngModel)]="codeInput"
                         placeholder="welcome_bonus" />
                  <span class="p-field__hint">
                    Slug único por tenant. No cambia después de crear.
                  </span>
                </div>
              }

              <div class="p-field">
                <label>Definición (JSON)</label>
                <textarea class="p-textarea"
                          rows="24"
                          spellcheck="false"
                          [(ngModel)]="dslText"
                          (ngModelChange)="onDslChange()"
                          placeholder="{}"></textarea>
                @if (parseError()) {
                  <span class="p-field__error">{{ parseError() }}</span>
                } @else {
                  <span class="p-field__hint">
                    Consejo: usa el prefijo <code class="p-mono">expr:</code> en un
                    string para evaluar aritmética con paths (ej.
                    <code class="p-mono">"expr:floor(data.amount_cop / 1000)"</code>),
                    y <code class="p-mono">path:</code> para referenciar datos
                    del evento o del customer.
                  </span>
                }
              </div>

              @if (isNew()) {
                <div class="p-field">
                  <button type="button" class="p-btn p-btn--ghost p-btn--sm"
                          (click)="loadStarter()">
                    <span class="material-icons-outlined">auto_fix_high</span>
                    Cargar plantilla "Bienvenida 100 pts"
                  </button>
                </div>
              }
            </div>
          </article>

          <!-- ── Dry run + Executions (derecha) ──────── -->
          <div class="right-column">
            <article class="p-card">
              <header class="p-card__head">
                <h2>Dry-run</h2>
                <span class="p-chip p-chip--info">sin efectos</span>
              </header>
              <div class="p-card__body" style="display: grid; gap: var(--p-space-5);">
                @if (isNew()) {
                  <div class="p-alert p-alert--info">
                    <span class="material-icons-outlined">info</span>
                    <div class="p-alert__body">
                      Guarda la regla para poder correr un dry-run.
                    </div>
                  </div>
                } @else {
                  <div class="p-field">
                    <label>Event type</label>
                    <input class="p-input p-mono"
                           [(ngModel)]="dryRunForm.event_type"
                           placeholder="customer.identified" />
                  </div>
                  <div class="p-field">
                    <label>Event data (JSON)</label>
                    <textarea class="p-textarea" rows="6"
                              [(ngModel)]="dryRunForm.event_data_text"></textarea>
                  </div>
                  <div class="p-field">
                    <label>Customer ID <span class="p-muted">(opcional)</span></label>
                    <input class="p-input p-mono" type="number"
                           [(ngModel)]="dryRunForm.customer_id" />
                  </div>
                  <button type="button" class="p-btn p-btn--secondary"
                          [disabled]="running()"
                          (click)="runDryRun()">
                    <span class="material-icons-outlined">bolt</span>
                    {{ running() ? 'Corriendo…' : 'Ejecutar dry-run' }}
                  </button>

                  @if (dryRunResult(); as r) {
                    <div class="p-divider"></div>
                    <div class="p-field">
                      <label>Resultado</label>
                      <div style="display: flex; gap: var(--p-space-4); flex-wrap: wrap;">
                        <span class="p-chip"
                              [class.p-chip--success]="r.status === 'fired'"
                              [class.p-chip--warning]="r.status === 'skipped' || r.status === 'rate_limited' || r.status === 'cooled_down'"
                              [class.p-chip--danger]="r.status === 'errored'">
                          {{ r.status }}
                        </span>
                        <span class="p-chip">condiciones {{ r.matched_conditions ? 'OK' : 'no cumplen' }}</span>
                        @if (r.latency_ms != null) {
                          <span class="p-chip">{{ r.latency_ms }} ms</span>
                        }
                      </div>
                    </div>
                    @if (r.actions_planned.length > 0) {
                      <div class="p-field">
                        <label>Acciones que se ejecutarían</label>
                        <pre class="p-code">{{ pretty(r.actions_planned) }}</pre>
                      </div>
                    }
                    @if (r.error) {
                      <div class="p-alert p-alert--danger">
                        <span class="material-icons-outlined">error_outline</span>
                        <div class="p-alert__body">{{ r.error }}</div>
                      </div>
                    }
                    @if (objectKeys(r.resolved_paths).length > 0) {
                      <details>
                        <summary class="p-muted" style="cursor: pointer; font-size: var(--p-text-sm);">
                          Ver paths resueltos
                        </summary>
                        <pre class="p-code" style="margin-top: var(--p-space-4);">{{ pretty(r.resolved_paths) }}</pre>
                      </details>
                    }
                  }
                }
              </div>
            </article>

            @if (!isNew()) {
              <article class="p-card">
                <header class="p-card__head">
                  <h2>Últimas ejecuciones</h2>
                  <button type="button" class="p-icon-btn" (click)="loadExecutions()"
                          [disabled]="loadingExecs()"
                          aria-label="Refrescar">
                    <span class="material-icons-outlined">refresh</span>
                  </button>
                </header>
                <div class="p-card__body p-card__body--flush">
                  @if (loadingExecs()) {
                    <div style="padding: var(--p-space-7); display: grid; gap: var(--p-space-4);">
                      <div class="p-skeleton" style="height: 24px;"></div>
                      <div class="p-skeleton" style="height: 24px;"></div>
                    </div>
                  } @else if (executions().length === 0) {
                    <p class="p-muted" style="padding: var(--p-space-7); margin: 0; text-align: center;">
                      Sin ejecuciones todavía. Cuando un evento matchee el trigger, aparecerán aquí.
                    </p>
                  } @else {
                    <table class="p-table">
                      <thead>
                        <tr>
                          <th>Cuándo</th>
                          <th>Estado</th>
                          <th>Customer</th>
                          <th class="num">ms</th>
                        </tr>
                      </thead>
                      <tbody>
                        @for (e of executions(); track e.id) {
                          <tr>
                            <td class="p-mono" style="font-size: var(--p-text-xs);">
                              {{ e.created_at | date:'short' }}
                            </td>
                            <td>
                              <span class="p-chip"
                                    [class.p-chip--success]="e.status === 'fired'"
                                    [class.p-chip--warning]="e.status === 'skipped' || e.status === 'rate_limited' || e.status === 'cooled_down'"
                                    [class.p-chip--danger]="e.status === 'errored'">
                                {{ e.status }}
                              </span>
                            </td>
                            <td class="muted">{{ e.customer_id ?? '—' }}</td>
                            <td class="num muted">{{ e.latency_ms ?? '—' }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  }
                </div>
              </article>
            }
          </div>
        </div>
      </section>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .editor-grid {
      display: grid;
      gap: var(--p-space-7);
      grid-template-columns: 1fr;
    }
    @media (min-width: 1024px) {
      .editor-grid {
        grid-template-columns: 3fr 2fr;
        align-items: start;
      }
    }
    .right-column {
      display: grid; gap: var(--p-space-7);
    }
  `],
})
export class RuleEditorComponent {
  private readonly api = inject(PerksApiService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly ruleId = signal<number | null>(null);
  readonly isNew = computed(() => this.ruleId() === null);

  readonly detail = signal<RuleDetail | null>(null);
  readonly loadError = signal<string | null>(null);

  readonly saving = signal(false);
  readonly saveError = signal<string | null>(null);
  readonly toggling = signal(false);

  readonly running = signal(false);
  readonly dryRunResult = signal<DryRunResult | null>(null);

  readonly loadingExecs = signal(false);
  readonly executions = signal<RuleExecutionOut[]>([]);

  codeInput = '';
  dslText = '';
  parseError = signal<string | null>(null);

  dryRunForm = {
    event_type: 'customer.identified',
    event_data_text: '{\n  "first_time": true\n}',
    customer_id: undefined as number | undefined,
  };

  readonly currentName = computed(() => this.detail()?.rule?.name);

  constructor() {
    const idParam = this.route.snapshot.paramMap.get('id');
    if (idParam) {
      const id = Number(idParam);
      this.ruleId.set(id);
      this.load(id);
    } else {
      this.dslText = JSON.stringify(STARTER_DEFINITION, null, 2);
    }
  }

  onDslChange(): void {
    try {
      JSON.parse(this.dslText || '{}');
      this.parseError.set(null);
    } catch (e: unknown) {
      this.parseError.set(
        e instanceof Error ? `JSON inválido: ${e.message}` : 'JSON inválido',
      );
    }
  }

  loadStarter(): void {
    this.dslText = JSON.stringify(STARTER_DEFINITION, null, 2);
    this.parseError.set(null);
  }

  load(id: number): void {
    this.loadError.set(null);
    this.api.getRule(id).subscribe({
      next: (d) => {
        this.detail.set(d);
        const dsl = d.active_dsl ?? {};
        this.dslText = JSON.stringify(dsl, null, 2);
        this.dryRunForm.event_type =
          (dsl as any)?.trigger?.event ?? 'customer.identified';
        this.loadExecutions();
      },
      error: (err: PerksApiError) => {
        this.loadError.set(err?.userMessage ?? 'Error al cargar');
      },
    });
  }

  loadExecutions(): void {
    const id = this.ruleId();
    if (id == null) return;
    this.loadingExecs.set(true);
    this.api.listExecutions(id, { limit: 20 }).subscribe({
      next: (r: ExecutionsResponse) => {
        this.executions.set(r.items);
        this.loadingExecs.set(false);
      },
      error: () => this.loadingExecs.set(false),
    });
  }

  save(): void {
    let definition: RuleDefinition;
    try {
      definition = JSON.parse(this.dslText) as RuleDefinition;
    } catch {
      this.parseError.set('JSON inválido — no se puede guardar');
      return;
    }
    if (this.parseError()) return;

    this.saving.set(true);
    this.saveError.set(null);

    if (this.isNew()) {
      const code = this.codeInput.trim();
      if (!code) {
        this.saving.set(false);
        this.saveError.set('El código es requerido');
        return;
      }
      this.api.createRule({ code, definition }).subscribe({
        next: (r) => {
          this.saving.set(false);
          this.router.navigate(['/perks/rules', r.id]);
        },
        error: (err: PerksApiError) => {
          this.saving.set(false);
          this.saveError.set(err?.userMessage ?? 'Error al crear');
        },
      });
    } else {
      const id = this.ruleId()!;
      this.api.updateRule(id, { definition }).subscribe({
        next: () => {
          this.saving.set(false);
          this.load(id);
        },
        error: (err: PerksApiError) => {
          this.saving.set(false);
          this.saveError.set(err?.userMessage ?? 'Error al guardar');
        },
      });
    }
  }

  toggle(): void {
    const d = this.detail();
    if (!d || this.toggling()) return;
    this.toggling.set(true);
    const call = d.rule.enabled
      ? this.api.disableRule(d.rule.id)
      : this.api.enableRule(d.rule.id);
    call.subscribe({
      next: (r) => {
        this.toggling.set(false);
        this.detail.set({ ...d, rule: r });
      },
      error: () => this.toggling.set(false),
    });
  }

  runDryRun(): void {
    const id = this.ruleId();
    if (id == null) return;
    let data: Record<string, unknown> = {};
    try {
      data = JSON.parse(this.dryRunForm.event_data_text || '{}');
    } catch (e: unknown) {
      this.dryRunResult.set(null);
      this.saveError.set(
        e instanceof Error
          ? `Event data JSON inválido: ${e.message}`
          : 'Event data JSON inválido',
      );
      return;
    }
    this.running.set(true);
    this.dryRunResult.set(null);
    this.api
      .dryRun(id, {
        event_type: this.dryRunForm.event_type,
        event_data: data,
        customer_id: this.dryRunForm.customer_id ?? null,
      })
      .subscribe({
        next: (r) => {
          this.dryRunResult.set(r);
          this.running.set(false);
        },
        error: (err: PerksApiError) => {
          this.dryRunResult.set(null);
          this.saveError.set(err?.userMessage ?? 'Error en dry-run');
          this.running.set(false);
        },
      });
  }

  pretty(value: unknown): string {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }

  objectKeys(o: object | null | undefined): string[] {
    return o ? Object.keys(o) : [];
  }
}
