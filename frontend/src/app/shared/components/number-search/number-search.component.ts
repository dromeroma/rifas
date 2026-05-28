import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { AdminService, NumberSearchResult } from '@core/services/admin.service';
import { ButtonComponent } from '@shared/ui';

/**
 * Buscador "qué boleta tiene el número X". Reusable para admin y vendedor.
 *
 * El backend escopa el resultado según el rol del usuario autenticado:
 *  - admin → busca en todas las boletas de la rifa
 *  - seller → solo entre las suyas (sino devuelve found=false con mensaje)
 *
 * Caso de uso típico:
 *  - Cliente pide "una boleta con el 1757" → tipea, ve si está libre o de quién es
 *  - Sale número ganador → tipea, ve dueño en 2 segundos
 */
@Component({
  selector: 'app-number-search',
  standalone: true,
  imports: [CommonModule, FormsModule, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="ns">
      <header class="ns__head">
        <span class="material-icons">search</span>
        <div>
          <strong>{{ title() }}</strong>
          @if (subtitle()) {
            <small>{{ subtitle() }}</small>
          }
        </div>
      </header>

      <form class="ns__form" (ngSubmit)="$event.preventDefault(); doSearch()">
        <input
          type="text"
          inputmode="numeric"
          [(ngModel)]="query"
          name="number"
          placeholder="Ej: 1757"
          autocomplete="off"
          spellcheck="false"
          maxlength="10"
          [disabled]="searching()"
        />
        <app-button
          type="submit"
          variant="info"
          icon="search"
          [loading]="searching()"
          [disabled]="!query || searching()">
          Buscar
        </app-button>
      </form>

      @if (result(); as r) {
        @if (r.found && r.ticket; as t) {
          <article class="ns__result ns__result--ok">
            <header>
              <span class="material-icons">{{ statusIcon(t.status) }}</span>
              <div>
                <strong>Boleta BOL {{ t.number_label }}</strong>
                <small>
                  El número <strong class="num">{{ r.number }}</strong> está en
                  la posición {{ r.position_in_field }} de la cancha.
                </small>
              </div>
              <span class="status-chip" [attr.data-status]="t.status">
                {{ statusLabel(t.status) }}
              </span>
            </header>

            <div class="grid">
              <div>
                <small class="label">Código</small>
                <strong class="mono">{{ t.code }}</strong>
              </div>
              @if (t.customer; as c) {
                <div>
                  <small class="label">Cliente</small>
                  <strong>{{ c.full_name }}</strong>
                  <small>{{ c.phone }}</small>
                </div>
              } @else {
                <div>
                  <small class="label">Cliente</small>
                  <small class="muted">— (sin asignar)</small>
                </div>
              }
              @if (t.seller; as s) {
                <div>
                  <small class="label">Vendedor</small>
                  <strong>{{ s.full_name }}</strong>
                </div>
              } @else if (!r.scoped_to_seller) {
                <div>
                  <small class="label">Vendedor</small>
                  <small class="muted">— (no asignada)</small>
                </div>
              }
            </div>

            <details class="nums">
              <summary>Ver los 20 números de esta boleta</summary>
              <div class="nums__grid">
                @for (n of t.all_numbers; track $index; let i = $index) {
                  <span class="num-chip" [class.num-chip--hit]="n === r.number">
                    {{ n }}
                  </span>
                }
              </div>
            </details>
          </article>
        } @else {
          <article class="ns__result ns__result--miss">
            <span class="material-icons">{{ r.scoped_to_seller ? 'lock' : 'search_off' }}</span>
            <div>
              <strong>
                {{ r.scoped_to_seller ? 'No está entre tus boletas' : 'No encontrado' }}
              </strong>
              <small>{{ r.message }}</small>
            </div>
          </article>
        }
      }

      @if (error()) {
        <article class="ns__result ns__result--err">
          <span class="material-icons">error_outline</span>
          <div>
            <strong>Error</strong>
            <small>{{ error() }}</small>
          </div>
        </article>
      }
    </section>
  `,
  styles: [`
    .ns {
      display: grid;
      gap: var(--s-3);
      padding: var(--s-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
    }

    .ns__head {
      display: flex;
      gap: var(--s-2);
      align-items: center;
    }
    .ns__head .material-icons {
      font-size: 22px;
      color: var(--info);
      background: var(--info-soft);
      padding: 8px;
      border-radius: 50%;
    }
    .ns__head strong { display: block; font-size: 14px; color: var(--text); }
    .ns__head small { display: block; font-size: 12px; color: var(--text-muted); }

    .ns__form {
      display: flex;
      gap: var(--s-2);
      align-items: stretch;
      flex-wrap: wrap;
    }
    .ns__form input {
      flex: 1;
      min-width: 160px;
      height: var(--h-input);
      padding: 0 var(--s-3);
      background: var(--bg-input);
      border: 1px solid transparent;
      color: var(--text);
      border-radius: var(--r-md);
      font-size: 18px;
      font-weight: 700;
      font-family: 'Inter', monospace;
      letter-spacing: 0.06em;
      text-align: center;
    }
    .ns__form input:focus { outline: 0; border-color: var(--info); }

    /* === Result === */
    .ns__result {
      display: grid;
      gap: var(--s-3);
      padding: var(--s-3);
      border-radius: var(--r-md);
      animation: nsFadeIn 0.18s ease-out;
    }
    @keyframes nsFadeIn {
      from { opacity: 0; transform: translateY(-3px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .ns__result--ok {
      background: var(--accent-soft);
      border: 1px solid color-mix(in srgb, var(--accent) 40%, transparent);
    }
    .ns__result--miss, .ns__result--err {
      display: flex;
      align-items: flex-start;
      gap: var(--s-2);
      background: var(--bg-base);
      border: 1px solid var(--border);
    }
    .ns__result--err { background: var(--danger-soft); border-color: var(--danger); }
    .ns__result--miss .material-icons,
    .ns__result--err .material-icons { font-size: 24px; color: var(--text-muted); }
    .ns__result--err .material-icons { color: var(--danger); }
    .ns__result strong { color: var(--text); font-size: 14px; }
    .ns__result small { color: var(--text-muted); font-size: 12px; display: block; }
    .ns__result small .num { color: var(--accent); font-family: 'Inter', monospace; }

    .ns__result--ok header {
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--s-2);
      align-items: center;
    }
    .ns__result--ok header .material-icons {
      font-size: 28px;
      color: var(--accent);
    }

    .status-chip {
      padding: 4px 10px;
      border-radius: var(--r-full);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      background: var(--bg-hover);
      color: var(--text-muted);
    }
    .status-chip[data-status='available'] { background: var(--bg-hover); color: var(--text); }
    .status-chip[data-status='reserved'],
    .status-chip[data-status='pending_payment'] { background: var(--warning-soft); color: var(--warning); }
    .status-chip[data-status='partially_paid'] { background: var(--info-soft); color: var(--info); }
    .status-chip[data-status='paid'] { background: var(--accent-soft); color: var(--accent); }
    .status-chip[data-status='winning'] { background: rgba(251,191,36,0.18); color: #f59e0b; }
    .status-chip[data-status='expired'] { background: var(--danger-soft); color: var(--danger); }

    /* Grid de info (código, cliente, vendedor) */
    .grid {
      display: grid;
      gap: var(--s-2);
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
      padding-top: var(--s-2);
      border-top: 1px dashed color-mix(in srgb, var(--accent) 35%, transparent);
    }
    .grid > div { display: grid; gap: 1px; }
    .grid small.label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      color: var(--text-muted);
    }
    .grid strong { font-size: 13px; color: var(--text); }
    .grid .mono { font-family: 'Courier New', monospace; font-size: 12px; }
    .grid .muted { color: var(--text-muted); font-style: italic; }

    /* Detalle de los 20 números */
    .nums { padding-top: var(--s-2); border-top: 1px dashed color-mix(in srgb, var(--accent) 35%, transparent); }
    .nums summary {
      cursor: pointer;
      font-size: 12px;
      color: var(--text-muted);
      font-weight: 600;
      user-select: none;
      padding: 4px 0;
    }
    .nums summary:hover { color: var(--accent); }
    .nums__grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(60px, 1fr));
      gap: 4px;
      margin-top: 8px;
    }
    .num-chip {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 6px;
      background: var(--bg-base);
      border: 1px solid var(--border);
      border-radius: var(--r-sm);
      font-family: 'Courier New', monospace;
      font-size: 11.5px;
      color: var(--text);
      font-weight: 600;
    }
    .num-chip--hit {
      background: var(--accent);
      color: var(--accent-fg);
      border-color: var(--accent);
      font-weight: 800;
    }
  `],
})
export class NumberSearchComponent {
  private readonly admin = inject(AdminService);

  readonly raffleId = input.required<number>();
  readonly title = input<string>('Buscar número en boletas');
  readonly subtitle = input<string>('');

  readonly searching = signal(false);
  readonly result = signal<NumberSearchResult | null>(null);
  readonly error = signal<string | null>(null);

  query = '';

  doSearch() {
    const q = (this.query || '').trim();
    if (!q) return;
    this.error.set(null);
    this.result.set(null);
    this.searching.set(true);

    this.admin.searchByNumber(this.raffleId(), q).subscribe({
      next: (r) => {
        this.result.set(r);
        this.searching.set(false);
      },
      error: (e) => {
        const detail = e?.error?.detail ?? 'No se pudo buscar el número.';
        this.error.set(typeof detail === 'string' ? detail : 'Error de búsqueda.');
        this.searching.set(false);
      },
    });
  }

  statusLabel(s: string): string {
    const map: Record<string, string> = {
      available: 'Libre',
      reserved: 'Reservada',
      pending_payment: 'Por pagar',
      partially_paid: 'Cuota',
      paid: 'Pagada',
      winning: 'Ganadora',
      expired: 'Expirada',
    };
    return map[s] ?? s;
  }

  statusIcon(s: string): string {
    switch (s) {
      case 'paid': return 'verified';
      case 'winning': return 'emoji_events';
      case 'available': return 'check_circle_outline';
      case 'reserved':
      case 'pending_payment': return 'schedule';
      case 'partially_paid': return 'timeline';
      case 'expired': return 'block';
      default: return 'help_outline';
    }
  }
}
