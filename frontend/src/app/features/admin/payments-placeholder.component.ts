import { Component } from '@angular/core';
import { EmptyComponent } from '@shared/ui';

@Component({
  selector: 'app-payments-placeholder',
  standalone: true,
  imports: [EmptyComponent],
  template: `
    <div class="page">
      <header class="page__head"><h1>Pagos</h1></header>
      <app-empty
        icon="payments"
        title="Próximamente"
        description="Subida de comprobantes, confirmación de pagos y cálculo automático de comisiones."
      />
    </div>
  `,
  styles: [`
    .page { display: grid; gap: var(--s-4); }
    .page__head h1 { font-size: 22px; }
  `],
})
export class PaymentsPlaceholderComponent {}
