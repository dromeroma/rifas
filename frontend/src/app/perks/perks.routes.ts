/**
 * Rutas del admin panel de Savvy Perks.
 *
 * Todas viven bajo `/perks/*` y comparten el shell (topbar + sidebar).
 * Auth + role guard ya se aplican desde app.routes.ts al padre.
 */
import { Routes } from '@angular/router';

export const PERKS_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./layout/perks-shell.component').then((m) => m.PerksShellComponent),
    children: [
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./features/overview/overview.component').then(
            (m) => m.OverviewComponent,
          ),
      },
      {
        path: 'onboarding',
        loadComponent: () =>
          import('./features/onboarding/onboarding.component').then(
            (m) => m.OnboardingComponent,
          ),
      },
      {
        path: 'customers',
        loadComponent: () =>
          import('./features/customers/customers-list.component').then(
            (m) => m.CustomersListComponent,
          ),
      },
      {
        path: 'activity',
        loadComponent: () =>
          import('./features/activity/activity.component').then(
            (m) => m.ActivityComponent,
          ),
      },
      {
        path: 'audit',
        loadComponent: () =>
          import('./features/audit/audit.component').then(
            (m) => m.AuditComponent,
          ),
      },
      {
        path: 'rules',
        loadComponent: () =>
          import('./features/rules/rules-list.component').then(
            (m) => m.RulesListComponent,
          ),
      },
      {
        path: 'rules/new',
        loadComponent: () =>
          import('./features/rules/rule-editor.component').then(
            (m) => m.RuleEditorComponent,
          ),
      },
      {
        path: 'rules/:id',
        loadComponent: () =>
          import('./features/rules/rule-editor.component').then(
            (m) => m.RuleEditorComponent,
          ),
      },
    ],
  },
];
