import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

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
  readonly collapsed = signal(false);
  readonly profileOpen = signal(false);
  readonly expandedMenus = signal<Set<string>>(new Set());

  readonly nav: NavItem[] = [
    { path: '/admin',             icon: 'space_dashboard', label: 'Dashboard',    roles: ['super_admin', 'admin'] },
    { path: '/seller',            icon: 'point_of_sale',   label: 'Mis ventas',   roles: ['seller'] },
    { path: '/admin/raffles',     icon: 'casino',          label: 'Rifas',        roles: ['super_admin', 'admin'], matchPrefix: true },
    { path: '/seller/customers',  icon: 'group',           label: 'Mis clientes', roles: ['seller'] },
    { path: '/admin/customers',   icon: 'group',           label: 'Clientes',     roles: ['super_admin', 'admin'] },
    { path: '/admin/assignments', icon: 'assignment_ind',  label: 'Asignaciones', roles: ['super_admin', 'admin'] },
    { path: '/admin/sellers',     icon: 'badge',           label: 'Vendedores',   roles: ['super_admin', 'admin'] },
    { path: '/admin/payments',    icon: 'payments',        label: 'Pagos',        roles: ['super_admin', 'admin'] },
    { path: '/admin/audit',       icon: 'history',         label: 'Auditoría',    roles: ['super_admin'] },
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
    if (!this.user()) this.auth.loadUser();
  }

  toggleSidebar() { this.collapsed.update((v) => !v); }
  toggleProfile() { this.profileOpen.update((v) => !v); }
  closeProfile() { this.profileOpen.set(false); }
  logout() { this.auth.logout(); }
}
