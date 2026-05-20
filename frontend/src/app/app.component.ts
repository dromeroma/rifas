import { DOCUMENT } from '@angular/common';
import { Component, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';

import { ConfirmService } from '@core/services/confirm.service';
import { ConfirmHostComponent, ToastHostComponent } from '@shared/ui';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastHostComponent, ConfirmHostComponent],
  template: `
    <router-outlet />
    <app-toast-host />
    <app-confirm-host />
  `,
})
export class AppComponent implements OnInit {
  private readonly router = inject(Router);
  private readonly doc = inject(DOCUMENT);
  private readonly confirmSvc = inject(ConfirmService);

  ngOnInit(): void {
    // Garantiza que ningún estilo previo bloquee el scroll/interacción del body
    this.resetBodyState();

    // En cada navegación, cierra cualquier overlay/modal/confirm que pudo
    // haber quedado abierto y resetea el body. Esto evita que un overlay
    // residual de la pantalla anterior bloquee la nueva.
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        this.confirmSvc.cancel();   // cierra confirm si está abierto
        this.resetBodyState();
      });
  }

  private resetBodyState(): void {
    const body = this.doc.body;
    if (!body) return;
    body.style.overflow = '';
    body.style.pointerEvents = '';
    body.removeAttribute('aria-hidden');
  }
}
