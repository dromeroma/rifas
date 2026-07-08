import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

/**
 * Página de resultado de pago Wompi.
 *
 * Wompi redirige al cliente aquí con query params:
 *   ?id=<wompi_transaction_id>&env=<sandbox|prod>
 *
 * Nosotros usamos la reference (que va en la URL path) para buscar
 * el estado en nuestro backend. El webhook probablemente ya llegó,
 * pero polleamos por si aún no.
 *
 * Ruta: /rifa/:id/pago/:reference
 */
@Component({
  selector: 'app-payment-result',
  standalone: true,
  imports: [CommonModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="page">
      <div class="card">
        @if (loading()) {
          <div class="spinner"></div>
          <h1>Verificando tu pago...</h1>
          <p>Esto puede tardar unos segundos mientras confirmamos con Wompi.</p>
        } @else if (status() === 'APPROVED') {
          <div class="hero hero--ok">
            <span class="material-icons big">check_circle</span>
            <h1>¡Pago confirmado! 🎉</h1>
            @if (labels()) {
              <p>Tus boletas: <strong>{{ labels() }}</strong></p>
            }
            <p>Te enviamos el detalle a tu correo. También puedes verlas en tu portal.</p>
            <div class="ctas">
              <a routerLink="/mi-cuenta" class="btn primary">Ver mis boletas</a>
              <a [routerLink]="['/rifa', raffleId, 'comprar']" class="btn ghost">Comprar más</a>
            </div>
          </div>
        } @else if (status() === 'PENDING') {
          <div class="hero hero--pending">
            <span class="material-icons big">schedule</span>
            <h1>Pago en proceso</h1>
            <p>Wompi está procesando tu pago. En unos minutos recibirás la confirmación por correo.</p>
            <a routerLink="/mi-cuenta" class="btn ghost">Ver estado en mi cuenta</a>
          </div>
        } @else {
          <div class="hero hero--err">
            <span class="material-icons big">cancel</span>
            <h1>Pago no completado</h1>
            <p>Tu pago no fue procesado. Tus boletas siguen reservadas por 24 horas si quieres intentar de nuevo.</p>
            <div class="ctas">
              <a [routerLink]="['/rifa', raffleId, 'comprar']" class="btn primary">Intentar de nuevo</a>
              <a routerLink="/mi-cuenta" class="btn ghost">Ir a mi cuenta</a>
            </div>
          </div>
        }
      </div>
    </main>
  `,
  styles: [`
    :host {
      display: block;
      background: linear-gradient(180deg, #faf6ee 0%, #f0e5c8 100%);
      min-height: 100vh;
      color: #1a2942;
      font-family: 'Inter', system-ui, sans-serif;
    }
    .page {
      max-width: 500px;
      margin: 0 auto;
      padding: 40px 16px;
      display: flex;
      align-items: center;
      min-height: 100vh;
    }
    .card {
      background: #fff;
      border-radius: 16px;
      padding: 40px 32px;
      text-align: center;
      width: 100%;
      box-shadow: 0 10px 40px rgba(0,0,0,0.08);
    }
    .spinner {
      display: inline-block;
      width: 40px; height: 40px;
      border: 3px solid rgba(26, 41, 66, 0.12);
      border-top-color: #c9a96e;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .big { font-size: 64px; margin-bottom: 8px; }
    .hero--ok .big { color: #1ec77b; }
    .hero--pending .big { color: #f59e0b; }
    .hero--err .big { color: #ef4444; }
    h1 { margin: 8px 0 12px; font-size: 24px; }
    p { color: #4b5563; margin: 8px 0; }
    .ctas { display: flex; gap: 8px; justify-content: center; margin-top: 20px; flex-wrap: wrap; }
    .btn {
      display: inline-flex; align-items: center; padding: 12px 20px;
      border-radius: 8px; font-weight: 600; text-decoration: none;
    }
    .btn.primary { background: #1ec77b; color: #fff; }
    .btn.ghost { background: transparent; border: 1px solid rgba(26, 41, 66, 0.2); color: #1a2942; }
  `],
})
export class PaymentResultComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);

  loading = signal(true);
  status = signal<'APPROVED' | 'PENDING' | 'DECLINED' | 'ERROR' | null>(null);
  labels = signal('');
  raffleId = 0;

  ngOnInit(): void {
    this.raffleId = Number(this.route.snapshot.paramMap.get('id')) || 0;
    const reference = this.route.snapshot.paramMap.get('reference');

    // Leer datos de localStorage (guardados durante checkout)
    if (reference) {
      try {
        const raw = localStorage.getItem(`boletera_tx_${reference}`);
        if (raw) {
          const data = JSON.parse(raw);
          this.labels.set((data.ticket_labels || []).join(', '));
        }
      } catch {}
    }

    // Wompi manda query param 'status' — leemos eso primero como hint
    const wompiStatus = this.route.snapshot.queryParamMap.get('status');
    if (wompiStatus) {
      const s = wompiStatus.toUpperCase();
      if (['APPROVED', 'DECLINED', 'VOIDED', 'ERROR', 'PENDING'].includes(s)) {
        this.status.set(s === 'DECLINED' || s === 'VOIDED' ? 'DECLINED' : s as any);
        this.loading.set(false);
        return;
      }
    }

    // TODO: pollear al backend para el estado real por reference.
    // Por ahora, asumimos PENDING hasta que llegue el webhook.
    setTimeout(() => {
      this.status.set('PENDING');
      this.loading.set(false);
    }, 1500);
  }
}
