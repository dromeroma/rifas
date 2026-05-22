import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { environment } from '@env/environment';

/**
 * Botón flotante de WhatsApp para soporte/ventas. Se ubica en la esquina
 * inferior derecha con un pulso sutil para llamar la atención sin gritar.
 *
 * El número y mensaje por defecto vienen de environment.ts.
 */
@Component({
  selector: 'app-whatsapp-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <a
      class="wa"
      [href]="href()"
      target="_blank"
      rel="noopener noreferrer"
      [attr.aria-label]="label() || 'Contactar por WhatsApp'"
      [title]="label() || 'Contactar por WhatsApp'"
    >
      <span class="wa__pulse" aria-hidden="true"></span>
      <svg class="wa__icon" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true">
        <path d="M19.11 17.27c-.27-.13-1.59-.78-1.83-.87-.25-.09-.43-.13-.6.13-.18.27-.7.87-.85 1.04-.16.18-.32.2-.59.07-.27-.13-1.13-.42-2.16-1.34-.8-.71-1.34-1.59-1.49-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.48-.07-.13-.6-1.44-.82-1.97-.21-.52-.43-.45-.6-.46l-.51-.01c-.18 0-.46.07-.7.34-.24.27-.92.9-.92 2.2 0 1.3.94 2.55 1.07 2.73.13.18 1.86 2.84 4.51 3.99 1.74.75 2.42.81 3.28.68.52-.08 1.59-.65 1.81-1.28.22-.62.22-1.16.16-1.27-.07-.11-.24-.18-.51-.31z M16 4C9.37 4 4 9.37 4 16c0 2.11.55 4.16 1.6 5.97L4 28l6.21-1.62A11.94 11.94 0 0 0 16 28c6.63 0 12-5.37 12-12S22.63 4 16 4zm0 21.93c-1.84 0-3.65-.5-5.22-1.45l-.37-.22-3.86 1.01 1.03-3.76-.24-.39A9.96 9.96 0 0 1 6.07 16C6.07 10.52 10.52 6.07 16 6.07S25.93 10.52 25.93 16 21.48 25.93 16 25.93z"/>
      </svg>
      @if (showLabel()) {
        <span class="wa__label">{{ label() || 'Contáctanos' }}</span>
      }
    </a>
  `,
  styles: [`
    .wa {
      position: fixed;
      right: clamp(16px, 4vw, 32px);
      bottom: clamp(16px, 4vw, 32px);
      z-index: 1000;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #25d366, #128c7e);
      color: white;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 0;
      box-shadow:
        0 8px 24px rgba(37, 211, 102, 0.4),
        0 2px 8px rgba(0, 0, 0, 0.2);
      transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1),
                  box-shadow 0.25s ease,
                  padding 0.25s ease,
                  width 0.25s ease;
      text-decoration: none;
      cursor: pointer;
      overflow: hidden;
    }
    .wa:hover {
      transform: translateY(-2px) scale(1.05);
      box-shadow:
        0 12px 32px rgba(37, 211, 102, 0.55),
        0 4px 12px rgba(0, 0, 0, 0.25);
    }
    .wa:active { transform: translateY(0) scale(0.98); }

    /* Pulso sutil para llamar la atención */
    .wa__pulse {
      position: absolute;
      inset: 0;
      border-radius: 50%;
      background: rgba(37, 211, 102, 0.5);
      animation: wa-pulse 2.4s ease-out infinite;
      pointer-events: none;
    }
    @keyframes wa-pulse {
      0%   { transform: scale(1);    opacity: 0.7; }
      70%  { transform: scale(1.6);  opacity: 0; }
      100% { transform: scale(1.6);  opacity: 0; }
    }

    .wa__icon {
      width: 30px;
      height: 30px;
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }

    .wa__label {
      display: none;
      font-weight: 600;
      font-size: 14px;
      letter-spacing: 0.01em;
      white-space: nowrap;
    }

    /* Si se pide showLabel, se vuelve pill con texto */
    :host(.with-label) .wa,
    .wa--with-label {
      width: auto;
      border-radius: 32px;
      padding: 0 22px 0 18px;
    }
    :host(.with-label) .wa__label,
    .wa--with-label .wa__label { display: inline; }

    /* Reduced motion */
    @media (prefers-reduced-motion: reduce) {
      .wa__pulse { animation: none; opacity: 0; }
      .wa, .wa:hover, .wa:active { transition: none; transform: none; }
    }

    /* En móviles bajo el bottom-nav del admin si aplica */
    @media (max-width: 720px) {
      .wa {
        bottom: clamp(80px, 18vw, 100px);
      }
    }
  `],
  host: {
    '[class.with-label]': 'showLabel()',
  },
})
export class WhatsAppButtonComponent {
  /** Mensaje pre-llenado en WhatsApp. */
  readonly message = input<string>(environment.whatsappDefaultMessage);
  /** Etiqueta opcional junto al ícono (queda como pill). */
  readonly label = input<string>('');
  /** Si true, muestra el texto del label al lado del ícono. */
  readonly showLabel = input<boolean>(false);

  readonly href = computed(() => {
    const phone = environment.whatsappNumber;
    const text = encodeURIComponent(this.message());
    return `https://wa.me/${phone}?text=${text}`;
  });
}
