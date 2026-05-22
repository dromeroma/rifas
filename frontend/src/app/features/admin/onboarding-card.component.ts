import { CommonModule } from '@angular/common';
import { Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

import { Raffle } from '@core/models/raffle.model';
import { AdminService } from '@core/services/admin.service';
import { AuthService } from '@core/services/auth.service';

/**
 * Tarjeta de bienvenida con checklist de 4 pasos para que el admin
 * nuevo sepa por dónde empezar. Se oculta sola cuando todos los
 * pasos están completos.
 */
@Component({
  selector: 'app-onboarding-card',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (visible()) {
      <section class="onb" role="region" aria-label="Pasos para empezar">
        <header class="onb__head">
          <div>
            <small class="onb__label">Empieza aquí</small>
            <h2>Bienvenido a Boletera, {{ authName() }} 👋</h2>
            <p class="muted">
              Completa estos 4 pasos para tener tu primera rifa vendiendo en menos de 10 minutos.
            </p>
          </div>
          <button class="onb__dismiss" type="button" (click)="dismiss()" aria-label="Cerrar guía">
            <span class="material-icons">close</span>
          </button>
        </header>

        <ol class="onb__steps">
          @for (s of steps(); track s.id) {
            <li class="step" [class.step--done]="s.done" [class.step--current]="!s.done && firstPending() === s.id">
              <div class="step__num">
                @if (s.done) {
                  <span class="material-icons">check</span>
                } @else {
                  {{ s.idx }}
                }
              </div>
              <div class="step__body">
                <strong>{{ s.title }}</strong>
                <small class="muted">{{ s.help }}</small>
              </div>
              @if (!s.done && firstPending() === s.id) {
                <a [routerLink]="s.link" class="step__cta">
                  Ir →
                </a>
              }
            </li>
          }
        </ol>

        <footer class="onb__foot">
          <small class="muted">
            <span class="material-icons">info</span>
            ¿Ya completaste todo? Cierra esta guía con la X de arriba.
          </small>
        </footer>
      </section>
    }
  `,
  styles: [`
    .onb {
      background: linear-gradient(135deg, var(--accent-soft), var(--bg-surface));
      border: 1px solid var(--accent);
      border-radius: var(--r-xl);
      padding: var(--s-5);
      display: grid;
      gap: var(--s-4);
    }
    .onb__head { display: flex; justify-content: space-between; align-items: flex-start; gap: var(--s-3); }
    .onb__label {
      display: block;
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }
    .onb h2 {
      margin: 4px 0 6px;
      font-size: 22px;
      letter-spacing: -0.01em;
    }
    .onb p { margin: 0; font-size: 14px; }
    .muted { color: var(--text-muted); }
    .onb__dismiss {
      background: transparent; border: 0;
      width: 32px; height: 32px;
      border-radius: 50%;
      color: var(--text-muted);
      cursor: pointer;
      display: grid; place-items: center;
    }
    .onb__dismiss:hover { background: var(--bg-hover); color: var(--text); }

    .onb__steps { list-style: none; padding: 0; margin: 0; display: grid; gap: var(--s-2); }
    .step {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--s-3);
      align-items: center;
      padding: var(--s-3);
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      transition: border-color var(--t-fast);
    }
    .step--current { border-color: var(--accent); box-shadow: 0 4px 12px -4px color-mix(in srgb, var(--accent) 30%, transparent); }
    .step--done { opacity: 0.65; }
    .step__num {
      width: 36px; height: 36px;
      border-radius: 50%;
      background: var(--bg-hover);
      color: var(--text);
      font-weight: 700;
      display: grid; place-items: center;
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .step--current .step__num { background: var(--accent); color: var(--accent-fg); }
    .step--done .step__num { background: var(--accent); color: var(--accent-fg); }
    .step__num .material-icons { font-size: 20px; }
    .step__body { display: grid; gap: 2px; min-width: 0; }
    .step__body strong { font-size: 14px; color: var(--text); }
    .step__body small { font-size: 12px; line-height: 1.4; }
    .step__cta {
      background: var(--accent); color: var(--accent-fg);
      padding: 6px 12px;
      border-radius: var(--r-sm);
      font-weight: 600; font-size: 13px;
      text-decoration: none;
      white-space: nowrap;
    }
    .step__cta:hover { background: var(--accent-hover); }

    .onb__foot small {
      display: inline-flex; align-items: center; gap: 4px;
      font-size: 12px;
    }
    .onb__foot .material-icons { font-size: 14px; color: var(--accent); }
  `],
})
export class OnboardingCardComponent {
  private readonly auth = inject(AuthService);

  /** Las rifas del tenant del admin (vienen del dashboard padre). */
  readonly raffles = input<Raffle[]>([]);
  /** Conteo de vendedores activos. El padre lo carga si quiere precisión total. */
  readonly sellersCount = input<number>(0);

  readonly dismissed = output<void>();

  private readonly STORAGE_KEY = 'boletera.onboarding.dismissed';

  readonly steps = computed(() => {
    const rs = this.raffles();
    const first = rs[0] ?? null;
    return [
      {
        id: 'create-raffle' as const,
        idx: 1,
        title: 'Crea tu primera rifa',
        help: 'Define nombre, premios, fechas, precio por boleta y comisión escalonada.',
        link: '/admin/raffles',
        done: rs.length > 0,
      },
      {
        id: 'generate-numbers' as const,
        idx: 2,
        title: 'Genera los números',
        help: '500 boletas con 20 números únicos cada una. Acción irreversible.',
        link: first ? ['/admin/raffles', first.id] : '/admin/raffles',
        done: first?.numbers_generated ?? false,
      },
      {
        id: 'invite-sellers' as const,
        idx: 3,
        title: 'Crea vendedores y asígnales boletas',
        help: 'Cada vendedor entra con su cuenta y ve solo sus boletas asignadas.',
        link: this.sellersCount() > 0 ? '/admin/assignments' : '/admin/sellers',
        done: this.sellersCount() > 0,
      },
      {
        id: 'share-public' as const,
        idx: 4,
        title: 'Comparte la URL pública',
        help: first
          ? `Tus clientes verán /rifa/${first.id} con % de venta, premios y umbral.`
          : 'Una vez creada la rifa, tendrás un link público para WhatsApp/redes.',
        link: first ? ['/admin/raffles', first.id] : '/admin/raffles',
        done: false, // siempre disponible como acción
      },
    ];
  });

  readonly firstPending = computed(() => this.steps().find((s) => !s.done)?.id ?? null);

  readonly visible = computed(() => {
    if (typeof localStorage !== 'undefined' && localStorage.getItem(this.STORAGE_KEY) === '1') {
      return false;
    }
    // Mostrar si el admin no ha completado al menos los 3 primeros pasos.
    const s = this.steps();
    const criticalDone = s[0].done && s[1].done && s[2].done;
    return !criticalDone;
  });

  authName(): string {
    const u = this.auth.user();
    return u?.full_name?.split(' ')[0] ?? '';
  }

  dismiss() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.STORAGE_KEY, '1');
    }
    this.dismissed.emit();
  }
}
