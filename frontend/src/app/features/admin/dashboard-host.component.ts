import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { AdminDashboardComponent } from './dashboard.component';
import { SuperAdminDashboardComponent } from './super-admin-dashboard.component';

/**
 * Host del dashboard que decide qué versión renderizar:
 *  - super_admin → vista de plataforma (KPIs de cuentas)
 *  - admin → vista de rifas del tenant
 */
@Component({
  selector: 'app-dashboard-host',
  standalone: true,
  imports: [CommonModule, AdminDashboardComponent, SuperAdminDashboardComponent],
  template: `
    @if (isSuperAdmin()) {
      <app-super-admin-dashboard />
    } @else {
      <app-admin-dashboard />
    }
  `,
})
export class DashboardHostComponent {
  private readonly auth = inject(AuthService);

  isSuperAdmin(): boolean {
    return this.auth.role() === 'super_admin';
  }
}
