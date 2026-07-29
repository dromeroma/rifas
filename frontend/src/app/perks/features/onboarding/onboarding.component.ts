/**
 * OnboardingComponent — checklist de arranque del tenant.
 *
 * Guía al owner por los 6 pasos que dejan Perks operando: marca,
 * primer cliente, primera regla, primer disparo, primera notificación
 * y activación. Los pasos con `auto_events` en el backend se marcan
 * solos cuando el evento del bus dispara — este componente solo
 * refresca y muestra estado.
 *
 * Cuando `activation_ready` es true, el botón "Activar Perks" queda
 * habilitado. Al activar, el backend emite tenant.activated y el
 * handler auto-completa el step go_live.
 *
 * El sub-formulario de marca (brand_setup) vive inline en la primera
 * card — es el único step que este componente puede resolver por sí
 * mismo sin salir del onboarding.
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
import { RouterLink } from '@angular/router';

import {
  OnboardingChecklist,
  OnboardingStep,
  OnboardingStepStatus,
  PerksApiError,
  PerksApiService,
  TenantProfileOut,
  TenantVertical,
} from '../../shared/services/perks-api.service';
import { PerksToastService } from '../../shared/services/perks-toast.service';

const CTA_ROUTES: Record<string, string> = {
  first_customer: '/perks/customers',
  first_rule: '/perks/rules/new',
  first_rule_fired: '/perks/rules',
  first_notification: '/perks/rules',
};

const VERTICALS: Array<{ value: TenantVertical; label: string }> = [
  { value: 'retail', label: 'Retail' },
  { value: 'restaurant', label: 'Restaurante' },
  { value: 'gym', label: 'Gimnasio / Fitness' },
  { value: 'isp', label: 'ISP / Telco' },
  { value: 'saas', label: 'SaaS' },
  { value: 'service', label: 'Servicios profesionales' },
  { value: 'hospitality', label: 'Hospitalidad / Hotelería' },
  { value: 'education', label: 'Educación' },
  { value: 'healthcare', label: 'Salud' },
  { value: 'other', label: 'Otro' },
];

@Component({
  selector: 'perks-onboarding',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, RouterLink],
  styleUrl: '../../shared/design/perks.scss',
  template: `
    <div class="perks-scope">
      <section class="p-page">
        <header class="p-page-head">
          <div class="p-page-head__titles">
            <h1>Configura tu Perks</h1>
            <p>
              Terminá estos pasos para dejar el motor operando. A medida que
              creás clientes, reglas y mensajes, los pasos se marcan solos.
            </p>
          </div>
          <div class="p-page-head__actions">
            @if (loaded()) {
              @if (checklist()?.activated) {
                <span class="p-chip p-chip--success">
                  <span class="material-icons-outlined">check_circle</span>
                  Activo
                </span>
              } @else {
                <button
                  type="button"
                  class="p-btn p-btn--primary"
                  [disabled]="!(checklist()?.activation_ready) || activating()"
                  (click)="activate()"
                  [title]="activateTooltip()"
                >
                  @if (activating()) {
                    <span class="material-icons-outlined">progress_activity</span>
                    Activando…
                  } @else {
                    <span class="material-icons-outlined">rocket_launch</span>
                    Activar Perks
                  }
                </button>
              }
            }
          </div>
        </header>

        @if (loading()) {
          <div class="p-skeleton" style="height: 60px;"></div>
          <div class="p-skeleton" style="height: 120px;"></div>
          <div class="p-skeleton" style="height: 120px;"></div>
        } @else if (error()) {
          <div class="p-alert p-alert--danger">
            <span class="material-icons-outlined">error_outline</span>
            <div>
              <div class="p-alert__title">No pudimos cargar el checklist</div>
              <div class="p-alert__body">{{ error() }}</div>
            </div>
          </div>
        } @else if (checklist(); as ck) {
          <!-- Progress bar -->
          <article class="p-card">
            <div class="p-card__body progress">
              <div class="progress__labels">
                <span class="progress__title">Tu progreso</span>
                <span class="progress__count">
                  {{ ck.completed + ck.skipped }} / {{ ck.total }} pasos
                </span>
              </div>
              <div class="progress__bar" role="progressbar"
                   [attr.aria-valuenow]="progressPct()"
                   aria-valuemin="0" aria-valuemax="100">
                <div class="progress__fill" [style.width.%]="progressPct()"></div>
              </div>
              <div class="progress__meta">
                {{ progressPct() }}% completo
                @if (ck.required_missing.length > 0) {
                  · faltan
                  <strong>{{ ck.required_missing.length }}</strong>
                  paso(s) obligatorio(s) para activar
                }
              </div>
            </div>
          </article>

          <!-- Brand setup inline form (step brand_setup) -->
          @if (brandStep(); as step) {
            <article class="p-card step-card" [class.step-card--done]="isDone(step)">
              <header class="p-card__head">
                <div class="step-card__title">
                  <span class="step-card__num">1</span>
                  <div>
                    <h2>{{ step.title }}</h2>
                    <p>{{ step.description }}</p>
                  </div>
                </div>
                <span class="p-chip" [class]="statusChipClass(step)">
                  {{ statusLabel(step) }}
                </span>
              </header>
              <div class="p-card__body brand-form">
                <div class="brand-form__grid">
                  <label class="p-field">
                    <span class="p-field__label">Nombre de la marca</span>
                    <input class="p-input" type="text"
                           placeholder="Perks de tu negocio"
                           [(ngModel)]="brandName" />
                  </label>
                  <label class="p-field">
                    <span class="p-field__label">Color primario</span>
                    <div class="brand-form__color">
                      <input class="brand-form__swatch" type="color"
                             [(ngModel)]="brandColor" />
                      <input class="p-input" type="text"
                             placeholder="#5b8def"
                             [(ngModel)]="brandColor" />
                    </div>
                  </label>
                  <label class="p-field">
                    <span class="p-field__label">Vertical</span>
                    <select class="p-input" [(ngModel)]="brandVertical">
                      <option [ngValue]="null">Sin especificar</option>
                      @for (v of verticals; track v.value) {
                        <option [ngValue]="v.value">{{ v.label }}</option>
                      }
                    </select>
                  </label>
                </div>
                <div class="brand-form__actions">
                  <button type="button"
                          class="p-btn p-btn--primary"
                          [disabled]="!canSaveBrand() || savingBrand()"
                          (click)="saveBrand()">
                    @if (savingBrand()) {
                      <span class="material-icons-outlined">progress_activity</span>
                      Guardando…
                    } @else {
                      <span class="material-icons-outlined">save</span>
                      Guardar marca
                    }
                  </button>
                  @if (isDone(step)) {
                    <button type="button"
                            class="p-btn p-btn--ghost"
                            (click)="reopen(step)">
                      <span class="material-icons-outlined">restart_alt</span>
                      Reabrir paso
                    </button>
                  }
                </div>
              </div>
            </article>
          }

          <!-- Resto de steps -->
          @for (step of otherSteps(); track step.key; let i = $index) {
            <article class="p-card step-card" [class.step-card--done]="isDone(step)">
              <header class="p-card__head">
                <div class="step-card__title">
                  <span class="step-card__num">{{ i + 2 }}</span>
                  <div>
                    <h2>
                      {{ step.title }}
                      @if (!step.required) {
                        <span class="p-chip p-chip--muted step-card__optional">Opcional</span>
                      }
                    </h2>
                    <p>{{ step.description }}</p>
                  </div>
                </div>
                <span class="p-chip" [class]="statusChipClass(step)">
                  {{ statusLabel(step) }}
                </span>
              </header>
              <div class="p-card__body step-card__actions">
                @if (ctaRoute(step); as route) {
                  <a [routerLink]="route" class="p-btn p-btn--secondary">
                    <span class="material-icons-outlined">arrow_forward</span>
                    {{ step.cta || 'Ir al paso' }}
                  </a>
                }
                @if (!isDone(step)) {
                  <button type="button" class="p-btn p-btn--ghost"
                          (click)="skip(step)"
                          [disabled]="busyKey() === step.key">
                    <span class="material-icons-outlined">block</span>
                    Saltar este paso
                  </button>
                  <button type="button" class="p-btn p-btn--ghost"
                          (click)="markDone(step)"
                          [disabled]="busyKey() === step.key">
                    <span class="material-icons-outlined">check</span>
                    Marcar como hecho
                  </button>
                } @else {
                  <button type="button" class="p-btn p-btn--ghost"
                          (click)="reopen(step)"
                          [disabled]="busyKey() === step.key">
                    <span class="material-icons-outlined">restart_alt</span>
                    Reabrir paso
                  </button>
                }
              </div>
            </article>
          }
        }
      </section>
    </div>
  `,
  styles: [`
    .progress__labels {
      display: flex; justify-content: space-between; align-items: baseline;
      margin-bottom: var(--p-space-4);
    }
    .progress__title {
      font-weight: var(--p-weight-semibold);
      color: var(--p-text-primary);
    }
    .progress__count {
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
    }
    .progress__bar {
      height: 10px;
      background: var(--p-surface-inset);
      border-radius: var(--p-radius-full);
      overflow: hidden;
      position: relative;
    }
    .progress__fill {
      height: 100%;
      background: linear-gradient(
        90deg,
        var(--p-brand-primary),
        var(--p-brand-primary-hover)
      );
      transition: width var(--p-motion-slow) var(--p-ease-out);
    }
    .progress__meta {
      margin-top: var(--p-space-4);
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
    }
    .progress__meta strong { color: var(--p-text-primary); }

    .step-card {
      transition: opacity var(--p-motion-base) var(--p-ease-out);
    }
    .step-card--done {
      opacity: 0.75;
    }
    .step-card__title {
      display: flex;
      align-items: flex-start;
      gap: var(--p-space-5);
    }
    .step-card__title h2 {
      display: flex;
      gap: var(--p-space-4);
      align-items: center;
    }
    .step-card__title p {
      margin: var(--p-space-3) 0 0;
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
      max-width: 60ch;
    }
    .step-card__num {
      display: inline-flex;
      align-items: center; justify-content: center;
      width: 32px; height: 32px;
      background: var(--p-brand-primary-soft);
      color: var(--p-brand-primary);
      border-radius: var(--p-radius-full);
      font-weight: var(--p-weight-semibold);
      flex-shrink: 0;
    }
    .step-card--done .step-card__num {
      background: var(--p-state-success-soft);
      color: var(--p-state-success);
    }
    .step-card__optional {
      font-size: 10px;
    }
    .step-card__actions {
      display: flex; gap: var(--p-space-4); flex-wrap: wrap;
    }

    /* Variante local para el chip "Saltado" — muted no está en primitives */
    .p-chip--muted {
      background: var(--p-surface-inset);
      color: var(--p-text-muted);
    }

    .brand-form__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: var(--p-space-5);
    }
    .brand-form__color {
      display: flex; gap: var(--p-space-3); align-items: center;
    }
    .brand-form__swatch {
      width: 42px; height: 42px;
      padding: 0; border: 1px solid var(--p-border-subtle);
      border-radius: var(--p-radius-md);
      cursor: pointer;
      background: transparent;
    }
    .brand-form__actions {
      margin-top: var(--p-space-6);
      display: flex; gap: var(--p-space-4); flex-wrap: wrap;
    }

    /* Etiqueta interna del form de marca — no-clash con .p-field global */
    .brand-form .p-field__label {
      color: var(--p-text-secondary);
      font-size: var(--p-text-sm);
      font-weight: var(--p-weight-medium);
    }
  `],
})
export class OnboardingComponent {
  private readonly api = inject(PerksApiService);
  private readonly toast = inject(PerksToastService);

  readonly verticals = VERTICALS;

  readonly checklist = signal<OnboardingChecklist | null>(null);
  readonly profile = signal<TenantProfileOut | null>(null);
  readonly loading = signal<boolean>(true);
  readonly loaded = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly busyKey = signal<string | null>(null);
  readonly activating = signal<boolean>(false);
  readonly savingBrand = signal<boolean>(false);

  brandName = '';
  brandColor = '#5b8def';
  brandVertical: TenantVertical | null = null;

  readonly progressPct = computed(() => {
    const ck = this.checklist();
    if (!ck) return 0;
    return Math.round(ck.progress * 100);
  });

  readonly brandStep = computed(() =>
    this.checklist()?.steps.find((s) => s.key === 'brand_setup') ?? null,
  );

  readonly otherSteps = computed(() =>
    (this.checklist()?.steps ?? []).filter((s) => s.key !== 'brand_setup'),
  );

  readonly activateTooltip = computed(() => {
    const ck = this.checklist();
    if (!ck) return '';
    if (ck.activation_ready) return 'Activar el motor de Perks';
    const missing = ck.required_missing.filter((k) => k !== 'go_live');
    return `Faltan estos pasos: ${missing.join(', ')}`;
  });

  constructor() {
    this.load();
  }

  private load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getOnboarding().subscribe({
      next: (ck) => {
        this.checklist.set(ck);
        this.loading.set(false);
        this.loaded.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err instanceof PerksApiError ? err.userMessage : 'Error de red',
        );
      },
    });
    this.api.getTenantProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.brandName = p.brand_name ?? '';
        this.brandColor = p.brand_color_primary ?? '#5b8def';
        this.brandVertical = p.vertical;
      },
      error: () => { /* silencioso — profile es opcional acá */ },
    });
  }

  isDone(step: OnboardingStep): boolean {
    return (
      step.status === ('completed' as OnboardingStepStatus) ||
      step.status === ('skipped' as OnboardingStepStatus)
    );
  }

  statusLabel(step: OnboardingStep): string {
    switch (step.status) {
      case 'completed': return '✓ Completado';
      case 'skipped':   return 'Saltado';
      case 'in_progress': return 'En progreso';
      default:          return 'Pendiente';
    }
  }

  statusChipClass(step: OnboardingStep): string {
    switch (step.status) {
      case 'completed': return 'p-chip p-chip--success';
      case 'skipped':   return 'p-chip p-chip--muted';
      case 'in_progress': return 'p-chip p-chip--warning';
      default:          return 'p-chip';
    }
  }

  ctaRoute(step: OnboardingStep): string | null {
    return CTA_ROUTES[step.key] ?? null;
  }

  canSaveBrand(): boolean {
    return !!this.brandName.trim() && !!this.brandColor.trim();
  }

  saveBrand(): void {
    if (!this.canSaveBrand() || this.savingBrand()) return;
    this.savingBrand.set(true);
    this.api
      .updateTenantProfile({
        brand_name: this.brandName.trim(),
        brand_color_primary: this.brandColor.trim(),
        vertical: this.brandVertical,
      })
      .subscribe({
        next: (p) => {
          this.profile.set(p);
          this.savingBrand.set(false);
          this.toast.success('Marca actualizada');
          this.refresh();
        },
        error: (err) => {
          this.savingBrand.set(false);
          this.toast.error(
            err instanceof PerksApiError ? err.userMessage : 'No se pudo guardar',
          );
        },
      });
  }

  markDone(step: OnboardingStep): void {
    if (this.busyKey()) return;
    this.busyKey.set(step.key);
    this.api.completeOnboardingStep(step.key).subscribe({
      next: () => {
        this.busyKey.set(null);
        this.toast.success(`"${step.title}" marcado como hecho`);
        this.refresh();
      },
      error: (err) => {
        this.busyKey.set(null);
        this.toast.error(
          err instanceof PerksApiError ? err.userMessage : 'No se pudo actualizar',
        );
      },
    });
  }

  skip(step: OnboardingStep): void {
    if (this.busyKey()) return;
    this.busyKey.set(step.key);
    this.api.skipOnboardingStep(step.key).subscribe({
      next: () => {
        this.busyKey.set(null);
        this.toast.success(`"${step.title}" saltado`);
        this.refresh();
      },
      error: (err) => {
        this.busyKey.set(null);
        this.toast.error(
          err instanceof PerksApiError ? err.userMessage : 'No se pudo saltar',
        );
      },
    });
  }

  reopen(step: OnboardingStep): void {
    if (this.busyKey()) return;
    this.busyKey.set(step.key);
    this.api.reopenOnboardingStep(step.key).subscribe({
      next: () => {
        this.busyKey.set(null);
        this.toast.success(`"${step.title}" reabierto`);
        this.refresh();
      },
      error: (err) => {
        this.busyKey.set(null);
        this.toast.error(
          err instanceof PerksApiError ? err.userMessage : 'No se pudo reabrir',
        );
      },
    });
  }

  activate(): void {
    if (this.activating()) return;
    this.activating.set(true);
    this.api.activateTenant().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.activating.set(false);
        this.toast.success('Perks activo 🎉');
        this.refresh();
      },
      error: (err) => {
        this.activating.set(false);
        if (err instanceof PerksApiError && err.isConflict) {
          const missing = (err.detail as any)?.missing ?? [];
          this.toast.error(`Faltan pasos: ${missing.join(', ')}`);
        } else {
          this.toast.error(
            err instanceof PerksApiError ? err.userMessage : 'No se pudo activar',
          );
        }
      },
    });
  }

  private refresh(): void {
    this.api.getOnboarding().subscribe({
      next: (ck) => this.checklist.set(ck),
      error: () => { /* mantiene el snapshot previo */ },
    });
  }
}
