import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, inject, input, signal,
} from '@angular/core';

import { environment } from '@env/environment';
import { ToastService } from '@core/services/toast.service';

/**
 * Bloque reutilizable para mostrar el link personal de un vendedor:
 *   https://<host>/rifa/:raffleId/comprar?v=<slug>
 *
 * Permite copiar al portapapeles y compartir por WhatsApp con mensaje
 * pre-cargado que incluye el nombre del vendedor y de la rifa.
 *
 * Se usa en:
 *   - /seller (dashboard del vendedor) — para que él comparta su link
 *   - /admin/sellers (listado admin) — para que el admin también lo tenga
 */
@Component({
  selector: 'app-seller-share-link',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (link(); as l) {
      <div class="share" [class.share--compact]="compact()">
        @if (!compact()) {
          <div class="share__head">
            <span class="material-icons">share</span>
            <div>
              <h4>Tu link personal</h4>
              <p>Compártelo con tus clientes. Solo verán tus boletas disponibles.</p>
            </div>
          </div>
        }
        <div class="share__url">
          <input class="share__input" type="text" [value]="l"
                 readonly (click)="selectAll($event)" />
          <button type="button" class="share__btn share__btn--copy"
                  (click)="copy(l)" [title]="copied() ? 'Copiado' : 'Copiar link'">
            @if (copied()) {
              <span class="material-icons">check</span>
              <span class="share__btn-label">Copiado</span>
            } @else {
              <span class="material-icons">content_copy</span>
              <span class="share__btn-label">Copiar</span>
            }
          </button>
          <a class="share__btn share__btn--wa" [href]="whatsappHref()"
             target="_blank" rel="noopener" title="Compartir por WhatsApp">
            <svg viewBox="0 0 32 32" width="18" height="18" fill="currentColor">
              <path d="M16 3C9.4 3 4 8.4 4 15c0 2.3.6 4.5 1.8 6.4L4 29l7.8-2.6c1.8 1 3.9 1.6 6.2 1.6h.1c6.6 0 12-5.4 12-12S22.6 3 16 3zm7 17.1c-.3.8-1.6 1.6-2.2 1.7-.6.1-1.3.1-2.1-.1-.5-.1-1.1-.3-1.9-.6-3.3-1.4-5.4-4.7-5.6-4.9-.2-.2-1.4-1.8-1.4-3.5s.9-2.5 1.2-2.8c.3-.3.7-.4.9-.4h.6c.2 0 .5 0 .7.5.3.6.9 2.1 1 2.3.1.1.1.3.1.5s-.1.4-.2.6c-.2.2-.3.4-.5.6-.2.2-.4.4-.2.7.2.3.9 1.4 1.9 2.3 1.3 1.1 2.4 1.5 2.7 1.6.3.2.5.1.7-.1.2-.2.8-1 1.1-1.3.3-.3.5-.3.9-.2.4.1 2.3 1.1 2.7 1.3.4.2.7.3.8.4.1.4.1.9-.2 1.4z"/>
            </svg>
            <span class="share__btn-label">WhatsApp</span>
          </a>
        </div>
      </div>
    } @else if (!compact()) {
      <div class="share share--warn">
        <span class="material-icons">info</span>
        <p>El link personal se genera automáticamente para vendedores.
          Contacta al administrador si aún no lo tienes.</p>
      </div>
    }
  `,
  styles: [`
    :host { display: block; }
    .share {
      display: grid;
      gap: 12px;
      padding: 16px 18px;
      background: var(--bg-hover, #1a2028);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 14px;
    }
    .share--compact { padding: 8px; background: transparent; border: none; }

    .share__head {
      display: flex; gap: 12px; align-items: flex-start;
    }
    .share__head .material-icons {
      font-size: 20px; color: var(--accent, #22c55e);
      background: rgba(34, 197, 94, 0.14);
      padding: 8px; border-radius: 10px;
      flex-shrink: 0;
    }
    .share__head h4 {
      margin: 0 0 2px;
      font-size: 14px;
      font-weight: 700;
      color: var(--text, #fff);
    }
    .share__head p {
      margin: 0;
      font-size: 12px;
      color: var(--text-muted, #94a3b8);
      line-height: 1.5;
    }

    .share__url {
      display: flex; gap: 8px;
      flex-wrap: wrap;
    }
    .share__input {
      flex: 1;
      min-width: 200px;
      padding: 10px 14px;
      background: var(--bg-input, #0f1622);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 10px;
      color: var(--text, #fff);
      font-family: 'JetBrains Mono', 'Menlo', ui-monospace, monospace;
      font-size: 12.5px;
      cursor: text;
      outline: none;
      text-overflow: ellipsis;
    }
    .share__input:focus { border-color: var(--accent, #22c55e); }

    .share__btn {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 14px;
      background: var(--bg-input, #0f1622);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 10px;
      color: var(--text, #fff);
      font-family: inherit;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      text-decoration: none;
      transition: background 120ms, border-color 120ms, transform 120ms;
    }
    .share__btn:hover {
      border-color: rgba(255,255,255,0.16);
      background: rgba(255,255,255,0.03);
    }
    .share__btn:active { transform: translateY(1px); }
    .share__btn .material-icons { font-size: 16px; }

    .share__btn--copy .material-icons { color: var(--accent, #22c55e); }
    .share__btn--wa {
      background: #25d366;
      border-color: transparent;
      color: #fff;
    }
    .share__btn--wa:hover {
      background: #1fbc59;
      border-color: transparent;
    }

    @media (max-width: 540px) {
      .share__btn-label { display: none; }
      .share__btn { padding: 10px 12px; }
    }

    .share--warn {
      display: flex; gap: 12px; align-items: center;
      padding: 12px 14px;
      background: rgba(245, 158, 11, 0.08);
      border: 1px solid rgba(245, 158, 11, 0.25);
      border-radius: 12px;
      color: var(--text-muted, #94a3b8);
      font-size: 13px;
    }
    .share--warn .material-icons { color: #f59e0b; font-size: 20px; flex-shrink: 0; }
    .share--warn p { margin: 0; line-height: 1.5; }
  `],
})
export class SellerShareLinkComponent {
  private readonly toast = inject(ToastService);

  readonly slug = input.required<string | null | undefined>();
  readonly raffleId = input.required<number>();
  readonly sellerName = input<string>('');
  readonly raffleName = input<string>('la rifa');
  /** Vista compacta (sin header explicativo) — para tablas o cards pequeñas. */
  readonly compact = input<boolean>(false);

  readonly copied = signal(false);

  readonly link = computed<string | null>(() => {
    const s = this.slug();
    const rid = this.raffleId();
    if (!s || !rid) return null;
    const host = this.publicHost();
    return `${host}/rifa/${rid}/comprar?v=${s}`;
  });

  readonly whatsappHref = computed<string>(() => {
    const l = this.link();
    if (!l) return '#';
    const name = this.sellerName();
    const raffle = this.raffleName();
    const opener = name
      ? `¡Hola! Soy ${name}. Estoy vendiendo boletas para la rifa "${raffle}".`
      : `¡Hola! Te comparto el link para comprar boletas de la rifa "${raffle}".`;
    const msg = `${opener}\n\nElige tu boleta favorita aquí:\n${l}`;
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  });

  private publicHost(): string {
    // Preferimos la URL pública configurada; si no, usamos el origin actual.
    const configured = environment.publicSiteUrl;
    if (configured) return configured.replace(/\/$/, '');
    return typeof window !== 'undefined' ? window.location.origin : '';
  }

  selectAll(ev: Event) {
    const input = ev.target as HTMLInputElement;
    input.select();
  }

  async copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      this.copied.set(true);
      this.toast.success('Link copiado', 'Ya puedes pegarlo donde quieras.');
      setTimeout(() => this.copied.set(false), 1800);
    } catch {
      // Fallback: seleccionar el input
      const input = document.querySelector<HTMLInputElement>('.share__input');
      input?.select();
      document.execCommand('copy');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    }
  }
}
