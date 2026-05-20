import { Injectable, signal } from '@angular/core';
import { Observable, Subject } from 'rxjs';

export type ConfirmTone = 'default' | 'danger' | 'warning';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
  icon?: string;
}

export interface ConfirmState extends ConfirmOptions {
  open: boolean;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private readonly _state = signal<ConfirmState | null>(null);
  readonly state = this._state.asReadonly();

  private current: Subject<boolean> | null = null;

  /** Abre el modal y emite true/false según la decisión del usuario. */
  ask(opts: ConfirmOptions): Observable<boolean> {
    // Si hay uno abierto, lo descartamos (false) antes de abrir el nuevo
    if (this.current) {
      this.current.next(false);
      this.current.complete();
    }
    this.current = new Subject<boolean>();
    this._state.set({
      open: true,
      tone: 'default',
      confirmLabel: 'Aceptar',
      cancelLabel: 'Cancelar',
      ...opts,
    });
    return this.current.asObservable();
  }

  confirm(): void {
    this.current?.next(true);
    this.current?.complete();
    this.current = null;
    this._state.set(null);
  }

  cancel(): void {
    this.current?.next(false);
    this.current?.complete();
    this.current = null;
    this._state.set(null);
  }
}
