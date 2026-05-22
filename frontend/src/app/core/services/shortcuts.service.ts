import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';

import { AuthService } from './auth.service';
import { ToastService } from './toast.service';

/**
 * Atajos de teclado globales estilo Gmail/Linear.
 *
 * Atajos disponibles:
 *   g d  → Dashboard
 *   g r  → Rifas (admin de tenant)
 *   g c  → Clientes
 *   g v  → Vendedores
 *   g p  → Pagos
 *   g t  → Cuentas (super_admin)
 *   g a  → Auditoría
 *   ?    → Muestra ayuda (toast con la lista)
 *
 * Las secuencias `g X` requieren `g` seguido de la siguiente tecla dentro de
 * 1.5 segundos. Si el usuario está escribiendo en un input/textarea, los
 * atajos se ignoran para no robar teclas.
 */
@Injectable({ providedIn: 'root' })
export class ShortcutsService {
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  private gPressedAt = 0;
  private installed = false;

  /** Llamar UNA vez al bootstrap (desde AppComponent). */
  install() {
    if (this.installed) return;
    this.installed = true;
    this.doc.addEventListener('keydown', this.onKey, true);
  }

  private onKey = (e: KeyboardEvent) => {
    // Ignorar mientras el usuario escribe en un input editable
    const target = e.target as HTMLElement | null;
    const tag = target?.tagName?.toLowerCase();
    const editable =
      target?.isContentEditable ||
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select';
    if (editable) return;

    // Ignorar con modificadores (queremos atajos limpios)
    if (e.ctrlKey || e.metaKey || e.altKey) return;

    const k = e.key.toLowerCase();

    if (k === '?') {
      e.preventDefault();
      this.showHelp();
      return;
    }

    const now = Date.now();
    const role = this.auth.role();

    // Secuencia `g X`
    if (this.gPressedAt && now - this.gPressedAt <= 1500) {
      this.gPressedAt = 0;
      const dest = this.targetForKey(k, role);
      if (dest) {
        e.preventDefault();
        this.router.navigate([dest]);
      }
      return;
    }

    if (k === 'g') {
      this.gPressedAt = now;
    }
  };

  private targetForKey(k: string, role: string | null): string | null {
    if (!role) return null;
    if (role === 'seller') {
      if (k === 'd') return '/seller';
      if (k === 'c') return '/seller/customers';
      return null;
    }
    if (role === 'super_admin') {
      if (k === 'd') return '/admin';
      if (k === 't') return '/admin/tenants';
      if (k === 'a') return '/admin/audit';
      return null;
    }
    // admin
    if (k === 'd') return '/admin';
    if (k === 'r') return '/admin/raffles';
    if (k === 'c') return '/admin/customers';
    if (k === 'v') return '/admin/sellers';
    if (k === 'p') return '/admin/payments';
    if (k === 'a') return '/admin/audit';
    return null;
  }

  private showHelp() {
    const role = this.auth.role();
    let lines: string[];
    if (role === 'super_admin') {
      lines = ['g d → Dashboard', 'g t → Cuentas', 'g a → Auditoría'];
    } else if (role === 'seller') {
      lines = ['g d → Mis ventas', 'g c → Mis clientes'];
    } else {
      lines = [
        'g d → Dashboard',
        'g r → Rifas',
        'g c → Clientes',
        'g v → Vendedores',
        'g p → Pagos',
        'g a → Auditoría',
      ];
    }
    this.toast.info('Atajos de teclado', lines.join(' · '));
  }
}
