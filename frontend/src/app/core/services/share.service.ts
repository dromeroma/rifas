import { Injectable } from '@angular/core';

/** Normaliza un teléfono para formato wa.me (solo dígitos, asume Colombia si vienen 10 dígitos empezando en 3). */
function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

export type ShareImageResult =
  | 'native'        // Web Share API: la imagen viajó al chat
  | 'clipboard'     // Imagen en clipboard → user pega con Ctrl+V
  | 'download'      // Solo descarga → user adjunta manualmente
  | 'cancelled';    // User canceló el share sheet

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
   * Comparte una imagen por el camino MÁS RELIABLE posible.
   *
   * Limitación real de la web: navigator.share({files, text}) en Android
   * y WhatsApp NO garantiza que ambas cosas lleguen — WhatsApp suele
   * elegir una y descarta la otra silenciosamente. Por eso aquí
   * separamos las jugadas:
   *
   *   1) Copiamos el texto al portapapeles (para que el usuario lo
   *      pegue como caption / mensaje de seguimiento).
   *   2) Disparamos navigator.share con SOLO el archivo de imagen
   *      (sin text/title que confundan a WhatsApp). Esto es lo único
   *      que garantiza que la foto llegue al chat seleccionado.
   *   3) Si Web Share no está disponible (desktop), intentamos copiar
   *      la imagen al clipboard como ClipboardItem para que el usuario
   *      la pegue con Ctrl+V en WhatsApp Web.
   *   4) Siempre, como red de seguridad, descargamos el archivo.
   *
   * El caller usa el `text` para decidir el toast y guiar al usuario.
   */
  async shareImage(blob: Blob, filename: string, options: {
    title?: string;
    text?: string;
    fallbackWhatsAppText?: string;
    toPhone?: string;
  } = {}): Promise<ShareImageResult> {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    const text = options.text || '';

    // 1) Pre-cargamos el texto en el portapapeles ANTES del share. Tiene que
    //    ser antes de la acción "user gesture" porque algunos navegadores
    //    pierden el permiso de clipboard cuando se abre el share sheet.
    if (text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        }
      } catch {
        // ignorar — no es bloqueante
      }
    }

    // 2) Web Share API con archivo SOLAMENTE (sin text/title) para que
    //    WhatsApp no se confunda y mande la imagen sí o sí.
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      const fileOnlyData: ShareData = { files: [file] };
      const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
      const canShareFiles = !nav.canShare || nav.canShare(fileOnlyData);
      if (canShareFiles) {
        try {
          await navigator.share(fileOnlyData);
          return 'native';
        } catch (e: unknown) {
          const err = e as { name?: string };
          if (err?.name === 'AbortError') return 'cancelled';
          // Otro error → caemos al fallback clipboard/download
        }
      }
    }

    // 3) Fallback desktop: copia la imagen al clipboard como ClipboardItem
    //    + abre WhatsApp Web con el texto pre-cargado.
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
      usedClipboard = false;
    }

    // 4) Red de seguridad: siempre dejamos el archivo en el dispositivo.
    this.download(blob, filename);

    // Abrimos WhatsApp con texto.
    const phone = options.toPhone ? normalizePhone(options.toPhone) : '';
    const waText = options.fallbackWhatsAppText || text;
    const waUrl = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(waText)}`
      : `https://wa.me/?text=${encodeURIComponent(waText)}`;
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
