import { Injectable } from '@angular/core';

/** Normaliza un teléfono para formato wa.me (solo dígitos, asume Colombia si vienen 10 dígitos empezando en 3). */
function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

export type ShareImageResult =
  | 'native'        // Web Share API con archivos → la imagen va con el mensaje (mejor caso, móvil)
  | 'clipboard'     // Imagen copiada al portapapeles → usuario la pega en WhatsApp Web (Ctrl+V)
  | 'download'      // Imagen descargada → usuario la adjunta manualmente
  | 'cancelled';    // Usuario canceló el share nativo (AbortError)

@Injectable({ providedIn: 'root' })
export class ShareService {
  /** Descarga un blob como archivo (link a/click). */
  download(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Comparte una imagen + texto. Estrategia robusta para asegurar que la
   * imagen SIEMPRE llegue al cliente, no solo el texto:
   *
   *   1) Web Share API con archivos (móviles Android/iOS modernos): es el
   *      camino ideal — la imagen y el texto viajan juntos al chat
   *      seleccionado en WhatsApp.
   *   2) Clipboard API (desktop Chrome/Edge): copia la imagen al
   *      portapapeles para que el usuario haga Ctrl+V en WhatsApp Web.
   *   3) Download fallback: descarga la imagen para que el usuario la
   *      adjunte manualmente al chat que se abre.
   *
   * Pase lo que pase, abre WhatsApp con el texto pre-armado.
   */
  async shareImage(blob: Blob, filename: string, options: {
    title?: string;
    text?: string;
    fallbackWhatsAppText?: string;
    toPhone?: string;
  } = {}): Promise<ShareImageResult> {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    const text = options.text || '';
    const phone = options.toPhone ? normalizePhone(options.toPhone) : '';
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(options.fallbackWhatsAppText || text)}`
      : `https://wa.me/?text=${encodeURIComponent(options.fallbackWhatsAppText || text)}`;

    // === 1) Web Share API con archivos ===
    // Intentamos siempre que navigator.share exista. canShare puede dar
    // false positives/negatives — preferimos intentar y capturar el error.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      const shareData: ShareData = {
        title: options.title || 'Boleta',
        text,
        files: [file],
      };
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      const canShareFiles = !nav.canShare || nav.canShare(shareData);
      if (canShareFiles) {
        try {
          await navigator.share(shareData);
          return 'native';
        } catch (e: unknown) {
          const err = e as { name?: string };
          if (err?.name === 'AbortError') return 'cancelled';
          // Si no es AbortError, caemos al fallback de clipboard/download.
        }
      }
    }

    // === 2) Clipboard API (escritorio moderno) ===
    // ClipboardItem soporta image/png en Chrome 76+, Edge 79+, Safari 13.1+.
    // Si el navegador lo soporta, copiamos la imagen → el usuario solo
    // tiene que hacer Ctrl+V en el chat de WhatsApp Web que abrimos.
    let usedClipboard = false;
    try {
      if (
        typeof ClipboardItem !== 'undefined'
        && navigator.clipboard
        && (navigator.clipboard as any).write
      ) {
        const item = new ClipboardItem({ [blob.type || 'image/png']: blob });
        await (navigator.clipboard as any).write([item]);
        usedClipboard = true;
      }
    } catch {
      // Falla común: la página debe estar enfocada y el browser puede bloquear.
      usedClipboard = false;
    }

    // === 3) Download como respaldo (siempre, así el usuario tiene el archivo) ===
    this.download(blob, filename);

    // Abrimos WhatsApp con texto pre-cargado.
    window.open(waUrl, '_blank', 'noopener');

    return usedClipboard ? 'clipboard' : 'download';
  }

  /** Abre WhatsApp directo a un número (sin archivo, solo texto). */
  openWhatsApp(phone: string, text: string): void {
    const p = normalizePhone(phone);
    const url = p
      ? `https://wa.me/${p}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
  }
}
