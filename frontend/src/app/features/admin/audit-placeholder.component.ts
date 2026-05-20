import { Component } from '@angular/core';
import { EmptyComponent } from '@shared/ui';

@Component({
  selector: 'app-audit-placeholder',
  standalone: true,
  imports: [EmptyComponent],
  template: `
    <div class="page">
      <header class="page__head"><h1>Auditoría</h1></header>
      <app-empty
        icon="history"
        title="Próximamente"
        description="Ver todas las acciones (logins, generación de números, reservas, pagos, etc.) con IP y user-agent. La tabla audit_logs ya se está poblando."
      />
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head h1 { font-size: 22px; }
  `],
})
export class AuditPlaceholderComponent {}
