/**
 * RulesListComponent — vista principal del módulo rules.
 *
 * Lista todas las reglas del tenant con filtros (enabled/all,
 * trigger event type). Click en fila → navega al editor.
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
import { Router, RouterLink } from '@angular/router';

import {
  PerksApiError,
  PerksApiService,
  RuleListItem,
} from '../../shared/services/perks-api.service';

@Component({
  selector: 'perks-rules-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <h1>Rules</h1>
            <p>
              Cuando pase X en tu negocio, haz Y automáticamente.
              Las reglas escuchan eventos (compras, cumpleaños, inactividad)
              y disparan acciones (puntos, cupones, mensajes).
            </p>
          </div>
          <div class="p-page-head__actions">
            <label style="display: inline-flex; align-items: center; gap: var(--p-space-4); font-size: var(--p-text-sm); color: var(--p-text-secondary);">
              <input type="checkbox" [(ngModel)]="onlyEnabled" (ngModelChange)="reload()" />
              Solo activas
            </label>
            <a routerLink="/perks/rules/new" class="p-btn p-btn--primary">
              <span class="material-icons-outlined">add</span>
              Nueva regla
            </a>
          </div>
        </header>

        <article class="p-card">
          <header class="p-card__head">
            <h2>Todas las reglas</h2>
            <span class="p-chip">{{ total() }} total</span>
          </header>
          <div class="p-card__body p-card__body--flush">
            @if (loading()) {
              <div style="padding: var(--p-space-7); display: grid; gap: var(--p-space-4);">
                <div class="p-skeleton" style="height: 42px;"></div>
                <div class="p-skeleton" style="height: 42px;"></div>
                <div class="p-skeleton" style="height: 42px;"></div>
              </div>
            } @else if (error()) {
              <div class="p-alert p-alert--danger" style="margin: var(--p-space-7);">
                <span class="material-icons-outlined">error_outline</span>
                <div>
                  <div class="p-alert__title">No pudimos cargar las reglas</div>
                  <div class="p-alert__body">{{ error() }}</div>
                </div>
              </div>
            } @else if (rules().length === 0) {
              <div class="p-empty">
                <span class="material-icons-outlined p-empty__icon">bolt</span>
                <h3 class="p-empty__title">Aún no tienes reglas</h3>
                <p class="p-empty__desc">
                  Empieza con una regla clásica: "cuando un cliente se identifica
                  por primera vez, dale 100 puntos de bienvenida".
                </p>
                <a routerLink="/perks/rules/new" class="p-btn p-btn--primary">
                  <span class="material-icons-outlined">add</span>
                  Crear mi primera regla
                </a>
              </div>
            } @else {
              <div style="overflow-x: auto;">
                <table class="p-table">
                  <thead>
                    <tr>
                      <th style="width: 40%;">Regla</th>
                      <th>Trigger</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (r of rules(); track r.id) {
                      <tr (click)="goTo(r.id)">
                        <td>
                          <div class="strong">{{ r.name }}</div>
                          <div class="muted p-mono" style="font-size: var(--p-text-xs);">
                            {{ r.code }}
                          </div>
                        </td>
                        <td>
                          <span class="p-chip">{{ r.trigger_event_type }}</span>
                        </td>
                        <td>
                          @if (r.enabled) {
                            <span class="p-chip p-chip--success">activa</span>
                          } @else {
                            <span class="p-chip">apagada</span>
                          }
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            }
          </div>
        </article>
      </section>
    </div>
  `,
})
export class RulesListComponent {
  private readonly api = inject(PerksApiService);
  private readonly router = inject(Router);

  readonly rules = signal<RuleListItem[]>([]);
  readonly total = signal(0);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  onlyEnabled = false;

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .listRules({ enabled: this.onlyEnabled ? true : undefined })
      .subscribe({
        next: (res) => {
          this.rules.set(res.items);
          this.total.set(res.total);
          this.loading.set(false);
        },
        error: (err: PerksApiError) => {
          this.error.set(err?.userMessage ?? 'Error de red');
          this.loading.set(false);
        },
      });
  }

  goTo(id: number): void {
    this.router.navigate(['/perks/rules', id]);
  }
}
