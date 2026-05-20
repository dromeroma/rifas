import { Injectable } from '@angular/core';

/** Normaliza un teléfono para formato wa.me (solo dígitos, asume Colombia si vienen 10 dígitos empezando en 3). */
function normalizePhone(phone: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10 && digits.startsWith('3')) return `57${digits}`;
  return digits;
}

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
   * Comparte una imagen.
   *   - Si el navegador soporta Web Share API con archivos (móvil moderno), abre el selector nativo.
   *   - Si no, descarga la imagen y abre WhatsApp web con texto pre-armado.
   * Si se pasa `toPhone`, abre el chat directo con ese número.
   * Devuelve true si se usó Web Share API.
   */
  async shareImage(blob: Blob, filename: string, options: {
    title?: string;
    text?: string;
    fallbackWhatsAppText?: string;
    toPhone?: string;
  } = {}): Promise<boolean> {
    const file = new File([blob], filename, { type: blob.type || 'image/png' });
    const nav = navigator as Navigator & { canShare?: (data: ShareData) => boolean };
    const shareData: ShareData = {
      title: options.title || 'Boleta',
      text: options.text || '',
      files: [file] as any,
    };

    if (nav.canShare && nav.canShare(shareData) && navigator.share) {
      try {
        await navigator.share(shareData);
        return true;
      } catch (e: any) {
        if (e?.name === 'AbortError') return false;
      }
    }

    // Fallback: descargar imagen + abrir WhatsApp
    this.download(blob, filename);
    const text = options.fallbackWhatsAppText || options.text || '';
    const phone = options.toPhone ? normalizePhone(options.toPhone) : '';
    const url = phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener');
    return false;
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
