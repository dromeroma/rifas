import { Injectable } from '@angular/core';

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
   * Devuelve true si se usó Web Share API.
   */
  async shareImage(blob: Blob, filename: string, options: {
    title?: string;
    text?: string;
    fallbackWhatsAppText?: string;
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
        // El usuario canceló: no es error real
        if (e?.name === 'AbortError') return false;
        // Caer al fallback
      }
    }

    // Fallback: descargar imagen + abrir WhatsApp con texto
    this.download(blob, filename);
    if (options.fallbackWhatsAppText) {
      const url = `https://wa.me/?text=${encodeURIComponent(options.fallbackWhatsAppText)}`;
      window.open(url, '_blank', 'noopener');
    }
    return false;
  }
}
