import {
  ApplicationRef, ComponentRef, EnvironmentInjector,
  Injectable, createComponent, inject,
} from '@angular/core';

import { Raffle, Ticket } from '@core/models/raffle.model';
import { TicketDesignComponent } from '@shared/components/ticket-design/ticket-design.component';

/**
 * Captura el componente <app-ticket-design> tal cual lo ve el usuario en la
 * previsualización y lo devuelve como PNG o PDF.
 *
 * Razones por las que NO usamos html2canvas:
 *   - No soporta aspect-ratio (la cancha colapsa)
 *   - Falla con repeating-linear-gradient (las rayas no salen)
 *   - Mal soporte de inline-flex baseline (números mal centrados)
 *
 * En su lugar usamos `modern-screenshot`, que es un sucesor moderno que
 * maneja todo lo anterior correctamente. Combinado con esperar fonts +
 * imágenes, garantiza que el render sea idéntico al preview.
 */
@Injectable({ providedIn: 'root' })
export class TicketCaptureService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  /** Captura la boleta como PNG (Blob image/png). */
  async capturePng(ticket: Ticket, raffle: Raffle): Promise<Blob> {
    return this.withTicket(ticket, raffle, async (el) => {
      return await this.rasterizeToBlob(el, 'image/png');
    });
  }

  /** Captura la boleta y la empaqueta como PDF (A6 vertical). */
  async capturePdf(ticket: Ticket, raffle: Raffle): Promise<Blob> {
    return this.withTicket(ticket, raffle, async (el) => {
      // Para PDF capturamos como JPEG (más compacto en jsPDF).
      const dataUrl = await this.rasterizeToDataUrl(el, 'image/jpeg', 0.95);

      // Necesitamos el aspect ratio real → cargamos el data URL en una Image.
      const img = await this.loadImage(dataUrl);

      const { jsPDF } = await import('jspdf');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });
      const margin = 4;
      const pageW = 105 - margin * 2;
      const pageH = 148 - margin * 2;
      const ratio = img.naturalWidth / img.naturalHeight;
      let w = pageW;
      let h = w / ratio;
      if (h > pageH) {
        h = pageH;
        w = h * ratio;
      }
      const x = (105 - w) / 2;
      const y = (148 - h) / 2;
      pdf.addImage(dataUrl, 'JPEG', x, y, w, h);
      return pdf.output('blob');
    });
  }

  /**
   * Monta el componente off-screen, ejecuta `fn` con el elemento renderizado,
   * y limpia. Garantiza cleanup incluso si la captura falla.
   */
  private async withTicket<T>(
    ticket: Ticket,
    raffle: Raffle,
    fn: (el: HTMLElement) => Promise<T>,
  ): Promise<T> {
    const qrImageUrl = await this.generateQr(ticket.code);

    // Host off-screen pero VISIBLE en el árbol de paint (de otro modo modern-
    // screenshot no puede leer estilos computados). top:0; left:-10000px
    // lo saca del viewport pero sigue siendo renderizado.
    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      zIndex: '-1',
      pointerEvents: 'none',
      // Asegura ancho consistente — el ticket por default es 320px.
      width: '320px',
    });
    document.body.appendChild(host);

    let compRef: ComponentRef<TicketDesignComponent> | null = null;
    try {
      compRef = createComponent(TicketDesignComponent, {
        environmentInjector: this.injector,
        hostElement: host,
      });
      compRef.setInput('ticket', ticket);
      compRef.setInput('raffleName', raffle.name);
      compRef.setInput('prizes', raffle.prizes);
      compRef.setInput('primaryColor', raffle.primary_color || '#1b8b3b');
      compRef.setInput('qrImageUrl', qrImageUrl);
      compRef.setInput(
        'verifyUrl',
        `${window.location.origin}/verify/${ticket.code}`,
      );
      // Contacto del responsable de la rifa → va en la banda inferior del
      // ticket-design para que la imagen sea autosuficiente al compartir.
      compRef.setInput('responsibleName', raffle.responsible_name ?? null);
      compRef.setInput('responsiblePhone', raffle.responsible_phone ?? null);
      // Precio de la boleta para que el comprador vea cuánto pagó cuando
      // reciba la imagen por WhatsApp.
      compRef.setInput('ticketPrice', raffle.ticket_price ?? null);
      // Diseño visual de la boleta (per-raffle): 'soccer' o 'romantic'.
      compRef.setInput('theme', raffle.ticket_theme ?? 'soccer');

      this.appRef.attachView(compRef.hostView);
      compRef.changeDetectorRef.detectChanges();

      // 1) Esperamos a que las fuentes (Inter) estén listas → sin esto, los
      //    números de los chips usan métricas de fallback y aparecen mal
      //    alineados.
      if (document.fonts && document.fonts.ready) {
        try {
          await document.fonts.ready;
        } catch {
          // Algunos navegadores rechazan fonts.ready; no es bloqueante.
        }
      }

      // 2) Esperamos 2 animation frames para que el browser termine de
      //    pintar (incluyendo el <img> del QR con su data URL).
      await this.nextFrame();
      await this.nextFrame();

      // 3) Si hay <img> dentro (QR), esperamos a que estén decoded.
      const imgs = Array.from(host.querySelectorAll('img'));
      await Promise.all(
        imgs.map((img) =>
          img.complete
            ? Promise.resolve()
            : new Promise<void>((resolve) => {
                img.onload = () => resolve();
                img.onerror = () => resolve();
              }),
        ),
      );

      return await fn(host);
    } finally {
      if (compRef) {
        this.appRef.detachView(compRef.hostView);
        compRef.destroy();
      }
      host.remove();
    }
  }

  /** Genera un QR como data URL apuntando a /verify/<code>. */
  private async generateQr(code: string): Promise<string> {
    const QR = (await import('qrcode')).default;
    const verifyUrl = `${window.location.origin}/verify/${code}`;
    return QR.toDataURL(verifyUrl, {
      errorCorrectionLevel: 'M',
      margin: 1,
      width: 256,
      color: { dark: '#0b3d91', light: '#ffffff' },
    });
  }

  /** Rasteriza el elemento a Blob usando modern-screenshot. */
  private async rasterizeToBlob(el: HTMLElement, type: 'image/png' | 'image/jpeg'): Promise<Blob> {
    const { domToBlob } = await import('modern-screenshot');
    // scale 2 → ~2x DPI, balance entre nitidez y memoria (mobile importa).
    const blob = await domToBlob(el, {
      scale: 2,
      type,
      quality: 0.95,
      // backgroundColor blanco para que se vea bien sobre cualquier chat.
      backgroundColor: '#ffffff',
    });
    if (!blob || blob.size === 0) {
      throw new Error('Captura vacía — render falló');
    }
    return blob;
  }

  /** Rasteriza el elemento a Data URL usando modern-screenshot. */
  private async rasterizeToDataUrl(
    el: HTMLElement,
    type: 'image/png' | 'image/jpeg',
    quality: number,
  ): Promise<string> {
    const { domToDataUrl } = await import('modern-screenshot');
    return await domToDataUrl(el, {
      scale: 2,
      type,
      quality,
      backgroundColor: '#ffffff',
    });
  }

  private loadImage(src: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('No se pudo cargar la imagen'));
      img.src = src;
    });
  }

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}
