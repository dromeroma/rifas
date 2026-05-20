import { Injectable, signal } from '@angular/core';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
  id: number;
  type: ToastType;
  title: string;
  message?: string;
  duration: number;
  removing?: boolean;
}

let _id = 0;
const REMOVE_ANIMATION_MS = 320;
const DEFAULT_DURATION = 5000;

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly _toasts = signal<Toast[]>([]);
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();
  readonly toasts = this._toasts.asReadonly();

  /** Muestra un toast genérico. Devuelve el id por si quieres cerrarlo manualmente. */
  show(input: { type: ToastType; title: string; message?: string; duration?: number }): number {
    const id = ++_id;
    const toast: Toast = {
      id,
      type: input.type,
      title: input.title,
      message: input.message,
      duration: input.duration ?? DEFAULT_DURATION,
    };
    // Prepend: el más nuevo va arriba en la pila visual.
    this._toasts.update((arr) => [toast, ...arr]);
    this.timers.set(id, setTimeout(() => this.dismiss(id), toast.duration));
    return id;
  }

  success(title: string, message?: string, duration?: number) {
    return this.show({ type: 'success', title, message, duration });
  }
  error(title: string, message?: string, duration?: number) {
    return this.show({ type: 'error', title, message, duration });
  }
  info(title: string, message?: string, duration?: number) {
    return this.show({ type: 'info', title, message, duration });
  }
  warning(title: string, message?: string, duration?: number) {
    return this.show({ type: 'warning', title, message, duration });
  }

  /** Cierra un toast: marca para animación de salida y luego lo retira del array. */
  dismiss(id: number): void {
    // Cancelar timer si lo cerraron a mano
    const timer = this.timers.get(id);
    if (timer) { clearTimeout(timer); this.timers.delete(id); }

    this._toasts.update((arr) =>
      arr.map((t) => (t.id === id ? { ...t, removing: true } : t)),
    );
    setTimeout(() => {
      this._toasts.update((arr) => arr.filter((t) => t.id !== id));
    }, REMOVE_ANIMATION_MS);
  }

  clear(): void {
    for (const t of this.timers.values()) clearTimeout(t);
    this.timers.clear();
    this._toasts.set([]);
  }
}
