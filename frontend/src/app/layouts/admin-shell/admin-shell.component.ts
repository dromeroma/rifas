import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { environment } from '@env/environment';
import { AuthService } from '@core/services/auth.service';
import { BottomNavComponent } from '@shared/components/bottom-nav/bottom-nav.component';
import { AvatarComponent, ThemeToggleComponent } from '@shared/ui';

export interface NavItem {
  path: string;
  icon: string;
  label: string;
  roles: ('super_admin' | 'admin' | 'seller')[];
  /** Si true, este item es activo también para subrutas (ej. /admin/raffles → /admin/raffles/:id). */
  matchPrefix?: boolean;
  /** Submenús opcionales. */
  children?: NavItem[];
}

@Component({
  selector: 'app-admin-shell',
  standalone: true,
  imports: [
    CommonModule, RouterOutlet, RouterLink, BottomNavComponent,
    AvatarComponent, ThemeToggleComponent,
  ],
  templateUrl: './admin-shell.component.html',
  styleUrl: './admin-shell.component.scss',
})
export class AdminShellComponent implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly user = this.auth.user;
  readonly appVersion = environment.version;
  readonly collapsed = signal(false);
  readonly profileOpen = signal(false);
  readonly expandedMenus = signal<Set<string>>(new Set());

  /** Banner global de suscripción para tenants en grace_period o por vencer. */
  readonly subscriptionBanner = computed<{
    tone: 'info' | 'warn' | 'danger';
    icon: string;
    title: string;
    message: string;
  } | null>(() => {
    const u = this.user();
    const t = u?.tenant;
    if (!t) return null;
    const status = t.subscription_status;
    const endDate = t.end_date;

    if (status === 'grace_period') {
      return {
        tone: 'warn',
        icon: 'warning_amber',
        title: 'Tu suscripción venció.',
        message: `Solo lectura por 7 días. Renueva antes de la fecha de gracia. Vencimiento: ${endDate}.`,
      };
    }
    if (status === 'expired') {
      return {
        tone: 'danger',
        icon: 'error',
        title: 'Suscripción vencida.',
        message: `Contacta a Boletera para renovar (venció el ${endDate}).`,
      };
    }
    if (status === 'suspended') {
      return {
        tone: 'danger',
        icon: 'block',
        title: 'Cuenta suspendida.',
        message: 'Contacta a Boletera para reactivarla.',
      };
    }
    // Active pero por vencer en <= 7 días
    if (status === 'active') {
      const days = Math.round((new Date(endDate).getTime() - Date.now()) / 86_400_000);
      if (days >= 0 && days <= 7) {
        return {
          tone: 'warn',
          icon: 'schedule',
          title: `Tu suscripción vence en ${days} día(s).`,
          message: 'Renueva con Boletera para evitar pérdida de acceso.',
        };
      }
    }
    return null;
  });

  readonly nav: NavItem[] = [
    { path: '/admin',             icon: 'space_dashboard', label: 'Dashboard',    roles: ['super_admin', 'admin'] },
    { path: '/seller',            icon: 'point_of_sale',   label: 'Mis ventas',   roles: ['seller'] },
    // Super admin: solo gestión de cuentas + auditoría. No opera sobre data de tenants.
    { path: '/admin/tenants',     icon: 'business',        label: 'Cuentas',      roles: ['super_admin'], matchPrefix: true },
    // Admin del tenant: gestiona sus rifas, clientes, vendedores y pagos.
    { path: '/admin/raffles',     icon: 'casino',          label: 'Rifas',        roles: ['admin'], matchPrefix: true },
    { path: '/seller/customers',  icon: 'group',           label: 'Mis clientes', roles: ['seller'] },
    { path: '/admin/customers',   icon: 'group',           label: 'Clientes',     roles: ['admin'] },
    { path: '/admin/assignments', icon: 'assignment_ind',  label: 'Asignaciones', roles: ['admin'] },
    { path: '/admin/sellers',     icon: 'badge',           label: 'Vendedores',   roles: ['admin'] },
    { path: '/admin/payments',    icon: 'payments',        label: 'Pagos',        roles: ['admin'] },
    { path: '/admin/audit',       icon: 'history',         label: 'Auditoría',    roles: ['super_admin', 'admin'] },
  ];

  readonly visibleNav = computed<NavItem[]>(() => {
    const role = this.user()?.role;
    if (!role) return [];
    return this.nav.filter((n) => n.roles.includes(role));
  });

  /** URL actual, reactiva. */
  readonly currentUrl = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map((e) => e.urlAfterRedirects),
    ),
    { initialValue: this.router.url },
  );

  /**
   * Devuelve el path del item activo basándose en el match más específico
   * con la URL actual. Esto evita que múltiples items se marquen como activos.
   */
  readonly activeItemPath = computed<string | null>(() => {
    const url = this.currentUrl();
    const candidates = this.flattenItems(this.visibleNav());
    let best: NavItem | null = null;
    let bestLen = -1;
    for (const item of candidates) {
      const exact = !item.matchPrefix;
      const matches = exact ? url === item.path : url === item.path || url.startsWith(item.path + '/');
      if (matches && item.path.length > bestLen) {
        best = item;
        bestLen = item.path.length;
      }
    }
    return best?.path ?? null;
  });

  /** Devuelve si un item con hijos tiene algún descendiente activo (para auto-expandir). */
  hasActiveChild(item: NavItem): boolean {
    const active = this.activeItemPath();
    if (!active || !item.children) return false;
    return item.children.some((c) => c.path === active);
  }

  isActive(item: NavItem): boolean {
    return this.activeItemPath() === item.path;
  }

  isExpanded(item: NavItem): boolean {
    return this.expandedMenus().has(item.path) || this.hasActiveChild(item);
  }

  toggleMenu(item: NavItem, event: MouseEvent) {
    if (!item.children?.length) return;
    event.preventDefault();
    this.expandedMenus.update((s) => {
      const next = new Set(s);
      if (next.has(item.path)) next.delete(item.path);
      else next.add(item.path);
      return next;
    });
  }

  private flattenItems(items: NavItem[]): NavItem[] {
    const out: NavItem[] = [];
    for (const i of items) {
      out.push(i);
      if (i.children) out.push(...this.flattenItems(i.children));
    }
    return out;
  }

  ngOnInit(): void {
    if (!this.user()) this.auth.loadUser().subscribe();
  }

  toggleSidebar() { this.collapsed.update((v) => !v); }
  toggleProfile() { this.profileOpen.update((v) => !v); }
  closeProfile() { this.profileOpen.set(false); }
  logout() { this.auth.logout(); }
}
