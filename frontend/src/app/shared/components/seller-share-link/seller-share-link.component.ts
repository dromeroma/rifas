import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy, Component, computed, inject, input, signal,
} from '@angular/core';

import { environment } from '@env/environment';
import { ToastService } from '@core/services/toast.service';

interface MessageTemplate {
  key: string;
  label: string;
  emoji: string;
  build: (ctx: { name: string; sellerName: string; raffleName: string; link: string; prize?: string }) => string;
}

/**
 * Plantillas motivacionales de mensaje de WhatsApp. `[nombre]` queda
 * como placeholder para que el vendedor lo reemplace al enviar (WhatsApp
 * permite editar el mensaje antes de mandarlo).
 *
 * El vendedor elige la plantilla que mejor le funcione con su tipo de
 * clientes: casual, persuasivo con propuesta de valor, urgencia,
 * o testimonio corto y directo.
 */
const TEMPLATES: MessageTemplate[] = [
  {
    key: 'casual',
    label: 'Casual',
    emoji: '👋',
    build: ({ sellerName, raffleName, link }) => (
`¡Hola [nombre]! 👋

Soy ${sellerName} y te tengo una oportunidad increíble: estoy vendiendo boletas para la rifa "${raffleName}".

Te comparto el link para que veas los premios y elijas tu boleta favorita 👇

${link}

¡Cualquier pregunta me escribes! 💚`
    ),
  },
  {
    key: 'persuasivo',
    label: 'Persuasivo',
    emoji: '🎯',
    build: ({ sellerName, raffleName, link }) => (
`¡Hola [nombre]! 🎯

Con solo una boleta puedes ganar increíbles premios de la rifa "${raffleName}". Es 100% transparente, con verificación pública y sorteo en vivo.

Yo soy ${sellerName}, tu vendedor de confianza. Elige tu boleta favorita:

${link}

Recuerda: al comprar, ya estás jugando. Al no comprar, ya perdiste 😉`
    ),
  },
  {
    key: 'urgencia',
    label: 'Urgencia',
    emoji: '⏰',
    build: ({ sellerName, raffleName, link }) => (
`¡[nombre], quedan pocas boletas! ⏰

Estoy vendiendo boletas de la rifa "${raffleName}" y se están agotando rápido. No te quedes por fuera.

Elige tu número antes de que se lo lleven:
${link}

Soy ${sellerName} — pago 100% seguro en línea o transferencia con comprobante. 💚`
    ),
  },
  {
    key: 'directo',
    label: 'Directo',
    emoji: '🎟️',
    build: ({ sellerName, raffleName, link }) => (
`Hola [nombre], soy ${sellerName}.

Te comparto el link de la rifa "${raffleName}" para que elijas tu boleta:

${link}

¡Éxito! 🎟️✨`
    ),
  },
  {
    key: 'motivacional',
    label: 'Motivacional',
    emoji: '🌟',
    build: ({ sellerName, raffleName, link }) => (
`¡[nombre], los ganadores no dudan! 🌟

Hoy tienes la oportunidad de participar en la rifa "${raffleName}" y llevarte premios increíbles a casa. Cada boleta es una posibilidad más.

Soy ${sellerName} y me encantaría verte como el próximo ganador:

${link}

¿Qué esperas? La suerte está de tu lado 🍀`
    ),
  },
];

/**
 * Bloque reutilizable para mostrar el link personal de un vendedor:
 *   https://<host>/rifa/:raffleId/comprar?v=<slug>
 *
 * Con opciones para:
 *  - Copiar link al portapapeles
 *  - Compartir por WhatsApp con mensaje pre-cargado (elegible entre
 *    5 plantillas motivacionales; el vendedor edita [nombre] al enviar).
 *
 * Se usa en /seller y en /admin/sellers/:id.
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

        <!-- Selector de plantilla -->
        <div class="tpl">
          <div class="tpl__label">
            <span class="material-icons">chat_bubble_outline</span>
            <span>Elige un tono de mensaje</span>
          </div>
          <div class="tpl__options" role="tablist">
            @for (t of templates; track t.key) {
              <button type="button" class="tpl__chip"
                      role="tab"
                      [class.tpl__chip--active]="selectedTemplate() === t.key"
                      [attr.aria-selected]="selectedTemplate() === t.key"
                      (click)="selectedTemplate.set(t.key)">
                <span class="tpl__chip-emoji">{{ t.emoji }}</span>
                <span>{{ t.label }}</span>
              </button>
            }
          </div>
        </div>

        <!-- Preview del mensaje -->
        <div class="preview">
          <div class="preview__head">
            <span class="material-icons">visibility</span>
            <span>Así se verá el mensaje al abrir WhatsApp</span>
          </div>
          <div class="preview__box">{{ previewMessage() }}</div>
          <p class="preview__hint">
            💡 <strong>Tip:</strong> al enviar, WhatsApp te dejará editar el
            mensaje. Solo reemplaza <code>[nombre]</code> por el nombre de tu
            cliente y ya.
          </p>
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
      gap: 14px;
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

    /* ============ Selector de plantillas ============ */
    .tpl { display: grid; gap: 8px; }
    .tpl__label {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px;
      color: var(--text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .tpl__label .material-icons { font-size: 14px; color: var(--accent, #22c55e); }
    .tpl__options {
      display: flex; flex-wrap: wrap;
      gap: 6px;
    }
    .tpl__chip {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 7px 12px;
      background: var(--bg-input, #0f1622);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 999px;
      color: var(--text-muted, #94a3b8);
      font-family: inherit;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: background 120ms, border-color 120ms, color 120ms;
    }
    .tpl__chip:hover {
      background: rgba(255,255,255,0.03);
      border-color: rgba(255,255,255,0.16);
      color: var(--text, #fff);
    }
    .tpl__chip--active {
      background: rgba(34, 197, 94, 0.14);
      border-color: var(--accent, #22c55e);
      color: var(--text, #fff);
    }
    .tpl__chip--active:hover { background: rgba(34, 197, 94, 0.2); }
    .tpl__chip-emoji { font-size: 14px; }

    /* ============ Preview del mensaje ============ */
    .preview { display: grid; gap: 8px; }
    .preview__head {
      display: inline-flex; align-items: center; gap: 6px;
      font-size: 11px;
      color: var(--text-muted, #94a3b8);
      text-transform: uppercase;
      letter-spacing: 0.08em;
      font-weight: 700;
    }
    .preview__head .material-icons { font-size: 14px; color: var(--accent, #22c55e); }
    .preview__box {
      padding: 14px 16px;
      background: var(--bg-input, #0f1622);
      border: 1px solid var(--border, rgba(255,255,255,0.08));
      border-radius: 12px;
      color: var(--text, #fff);
      font-size: 13.5px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      max-height: 280px;
      overflow-y: auto;
    }
    .preview__hint {
      margin: 0;
      font-size: 12px;
      color: var(--text-muted, #94a3b8);
      line-height: 1.55;
    }
    .preview__hint code {
      background: rgba(34, 197, 94, 0.12);
      color: var(--accent, #22c55e);
      padding: 1px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', 'Menlo', ui-monospace, monospace;
      font-size: 11.5px;
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
  readonly compact = input<boolean>(false);

  readonly templates = TEMPLATES;
  readonly selectedTemplate = signal<string>('casual');
  readonly copied = signal(false);

  readonly link = computed<string | null>(() => {
    const s = this.slug();
    const rid = this.raffleId();
    if (!s || !rid) return null;
    const host = this.publicHost();
    return `${host}/rifa/${rid}/comprar?v=${s}`;
  });

  readonly previewMessage = computed<string>(() => {
    const l = this.link();
    if (!l) return '';
    const tpl = TEMPLATES.find((t) => t.key === this.selectedTemplate()) ?? TEMPLATES[0];
    return tpl.build({
      name: '[nombre]',
      sellerName: this.sellerName() || 'tu vendedor',
      raffleName: this.raffleName() || 'esta rifa',
      link: l,
    });
  });

  readonly whatsappHref = computed<string>(() => {
    const msg = this.previewMessage();
    if (!msg) return '#';
    return `https://wa.me/?text=${encodeURIComponent(msg)}`;
  });

  private publicHost(): string {
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
      const input = document.querySelector<HTMLInputElement>('.share__input');
      input?.select();
      document.execCommand('copy');
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1800);
    }
  }
}
