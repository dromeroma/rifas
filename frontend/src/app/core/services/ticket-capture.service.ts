import {
  ApplicationRef, ComponentRef, EnvironmentInjector,
  Injectable, createComponent, inject,
} from '@angular/core';

import { Raffle, Ticket } from '@core/models/raffle.model';
import { TicketDesignComponent } from '@shared/components/ticket-design/ticket-design.component';

/**
 * Captura el componente <app-ticket-design> tal cual lo ve el usuario en la
 * previsualización y lo devuelve como PNG o PDF. Usa html2canvas y jspdf
 * cargados perezosamente (dynamic import) para no inflar el bundle inicial.
 *
 * Flujo:
 *  1) Genera QR como data URL con `qrcode`.
 *  2) Crea un host off-screen (visible pero fuera del viewport) y monta el
 *     componente Angular dentro con los inputs configurados.
 *  3) Espera un par de animation frames para que se rasterize.
 *  4) html2canvas captura el DOM → ImageBlob.
 *  5) Para PDF: jsPDF agrega la imagen en una página con margen.
 *  6) Limpia el componente.
 */
@Injectable({ providedIn: 'root' })
export class TicketCaptureService {
  private readonly appRef = inject(ApplicationRef);
  private readonly injector = inject(EnvironmentInjector);

  /** Captura la boleta como PNG (Blob image/png). */
  async capturePng(ticket: Ticket, raffle: Raffle): Promise<Blob> {
    return this.withTicket(ticket, raffle, async (el) => {
      const canvas = await this.rasterize(el);
      return await this.canvasToBlob(canvas, 'image/png');
    });
  }

  /** Captura la boleta y la empaqueta como PDF (A6 vertical). */
  async capturePdf(ticket: Ticket, raffle: Raffle): Promise<Blob> {
    return this.withTicket(ticket, raffle, async (el) => {
      const canvas = await this.rasterize(el);
      const { jsPDF } = await import('jspdf');
      // A6 vertical (105 × 148 mm). El canvas tiene aspect 2:3 aprox (la cancha
      // marca el ratio), así que cabe bien con margen.
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a6' });
      const margin = 4;
      const pageW = 105 - margin * 2;
      const pageH = 148 - margin * 2;
      // Calcula tamaño manteniendo aspect ratio del canvas.
      const ratio = canvas.width / canvas.height;
      let w = pageW;
      let h = w / ratio;
      if (h > pageH) {
        h = pageH;
        w = h * ratio;
      }
      const x = (105 - w) / 2;
      const y = (148 - h) / 2;
      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', x, y, w, h);
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

    const host = document.createElement('div');
    host.setAttribute('aria-hidden', 'true');
    // Off-screen pero renderizado: top:0 left:-10000px evita que html2canvas
    // capture estilos como `visibility:hidden` (que sí oculta del paint).
    Object.assign(host.style, {
      position: 'fixed',
      top: '0',
      left: '-10000px',
      zIndex: '-1',
      pointerEvents: 'none',
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

      this.appRef.attachView(compRef.hostView);
      compRef.changeDetectorRef.detectChanges();

      // Espera 2 frames para que el browser pinte (el QR es <img> con data URL,
      // ya cargado sync, pero damos margen para fuentes/CSS).
      await this.nextFrame();
      await this.nextFrame();

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

  private async rasterize(el: HTMLElement): Promise<HTMLCanvasElement> {
    const html2canvas = (await import('html2canvas')).default;
    // scale 3 → ~3x DPI para imagen nítida al compartir/imprimir.
    return await html2canvas(el, {
      backgroundColor: null,
      scale: 3,
      useCORS: true,
      logging: false,
      // Permite que estilos como @media print no interfieran.
      windowWidth: el.scrollWidth,
      windowHeight: el.scrollHeight,
    });
  }

  private canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
    return new Promise((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('Canvas vacío'))),
        type,
        0.95,
      );
    });
  }

  private nextFrame(): Promise<void> {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
}
