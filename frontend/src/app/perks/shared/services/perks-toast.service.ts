/**
 * PerksToastService — toasts globales del admin panel.
 *
 * Scoped al panel Perks — no reusa el toast legacy para no depender
 * de él ni contaminarse con su estilo. Un signal expone la lista
 * actual; el shell renderiza el container.
 */
import { Injectable, signal } from '@angular/core';

export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export interface PerksToast {
  id: number;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration: number; // ms; 0 = manual dismiss
}

let _counter = 0;

@Injectable({ providedIn: 'root' })
export class PerksToastService {
  private readonly _toasts = signal<PerksToast[]>([]);
  readonly toasts = this._toasts.asReadonly();

  push(
    variant: ToastVariant,
    title: string,
    description?: string,
    duration = 4500,
  ): number {
    const id = ++_counter;
    const toast: PerksToast = { id, variant, title, description, duration };
    this._toasts.update((list) => [...list, toast]);
    if (duration > 0) {
      setTimeout(() => this.dismiss(id), duration);
    }
    return id;
  }

  success(title: string, description?: string): number {
    return this.push('success', title, description);
  }
  error(title: string, description?: string): number {
    return this.push('error', title, description, 6500);
  }
  info(title: string, description?: string): number {
    return this.push('info', title, description);
  }
  warning(title: string, description?: string): number {
    return this.push('warning', title, description);
  }

  dismiss(id: number): void {
    this._toasts.update((list) => list.filter((t) => t.id !== id));
  }

  clear(): void {
    this._toasts.set([]);
  }
}
