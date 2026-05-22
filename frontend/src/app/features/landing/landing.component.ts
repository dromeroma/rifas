import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { environment } from '@env/environment';
import { AuthService } from '@core/services/auth.service';
import { WhatsAppButtonComponent } from '@shared/components/whatsapp-button/whatsapp-button.component';
import { ButtonComponent, ThemeToggleComponent } from '@shared/ui';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, ThemeToggleComponent, WhatsAppButtonComponent],
  template: `
    <main class="landing">
      <header class="nav">
        <a routerLink="/" class="brand" aria-label="Boletera">
          <span class="brand__logo">🎟️</span>
          <strong class="brand__name">Boletera</strong>
        </a>
        <nav class="nav__links">
          <a href="#beneficios">Funcionalidades</a>
          <a href="#features">Cómo funciona</a>
          <a href="#roles">Para quién es</a>
          <a href="#planes">Planes</a>
          <a routerLink="/verify">Verificar boleta</a>
        </nav>
        <div class="nav__actions">
          <app-theme-toggle />
          <app-button variant="primary" size="sm" icon="login" (click)="goToLogin()">
            {{ ctaLabel() }}
          </app-button>
        </div>
      </header>

      <!-- ============ HERO ============ -->
      <section class="hero">
        <!-- Blobs decorativos en movimiento -->
        <div class="hero__bg" aria-hidden="true">
          <div class="blob blob--1"></div>
          <div class="blob blob--2"></div>
        </div>

        <div class="hero__content">
          <span class="hero__badge fx-hero fx-hero--1">Hecho en Colombia · v0.1</span>
          <h1 class="fx-hero fx-hero--2">
            Tu rifa, <span class="accent">profesional</span> desde el primer ticket.
          </h1>
          <p class="hero__tagline fx-hero fx-hero--3">
            Boletera convierte cualquier rifa en un negocio organizado: boletas
            únicas con QR, comisiones automáticas, pagos con comprobante y
            verificación pública. Sin Excel. Sin chats sueltos. Sin perder un peso.
          </p>
          <div class="hero__ctas fx-hero fx-hero--4">
            <app-button variant="primary" size="lg" icon="rocket_launch" (click)="goToLogin()">
              {{ ctaLabel() }}
            </app-button>
            <a href="#features" class="hero__secondary">
              <span class="material-icons">play_circle</span>
              Ver cómo funciona
            </a>
          </div>
          <p class="hero__trust fx-hero fx-hero--5">
            ✓ Boletas únicas inmutables · ✓ Auditoría completa · ✓ Mobile first
          </p>
        </div>

        <div class="hero__art" aria-hidden="true">
          <div class="ticket-enter">
            <div class="ticket-float">
              <div class="ticket">
                <div class="ticket__head">
                  <span class="ticket__label">N° 042</span>
                  <span class="ticket__code">MP5-Q8E-M0Y</span>
                </div>
                <div class="ticket__nums">
                  @for (n of demoNumbers; track n) {
                    <span class="ticket__num">{{ n }}</span>
                  }
                </div>
                <div class="ticket__foot">
                  <small>Sorteo final · 30/08/2026</small>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ============ BENEFICIOS ============ -->
      <section id="beneficios" class="features">
        <h2 class="fx-reveal fx-reveal--up">Vender rifas, sin perder cuentas.</h2>
        <p class="muted fx-reveal fx-reveal--up">
          Todo lo que necesitas para administrar una rifa de extremo a extremo.
        </p>

        <div class="feature-grid fx-stagger">
          <article class="feature fx-reveal fx-reveal--up">
            <span class="material-icons">qr_code_2</span>
            <h3>Boletas únicas con QR</h3>
            <p>Cada boleta tiene un código irrepetible e inmutable. Tus clientes verifican en segundos.</p>
          </article>
          <article class="feature fx-reveal fx-reveal--up">
            <span class="material-icons">stairs</span>
            <h3>Comisiones escalonadas</h3>
            <p>Configura tramos por boletas vendidas (ej: 1‑30 a $3.000, 31‑50 a $4.000, 51+ a $5.000). El sistema recalcula automáticamente.</p>
          </article>
          <article class="feature fx-reveal fx-reveal--up">
            <span class="material-icons">receipt_long</span>
            <h3>Pagos con comprobante</h3>
            <p>El vendedor sube la foto del pago. El administrador confirma o rechaza con un clic.</p>
          </article>
          <article class="feature fx-reveal fx-reveal--up">
            <span class="material-icons">verified_user</span>
            <h3>Verificación pública</h3>
            <p>Tus clientes verifican su boleta sin login. URL única + escaneo de QR.</p>
          </article>
          <article class="feature fx-reveal fx-reveal--up">
            <span class="material-icons">history</span>
            <h3>Trazabilidad total</h3>
            <p>Cada acción queda registrada: quién reservó, quién pagó, quién confirmó.</p>
          </article>
          <article class="feature fx-reveal fx-reveal--up">
            <span class="material-icons">phone_iphone</span>
            <h3>Funciona en celular</h3>
            <p>Tus vendedores trabajan desde el bus, en su casa, donde sea. Bottom-nav móvil incluido.</p>
          </article>
        </div>
      </section>

      <!-- ============ CÓMO FUNCIONA ============ -->
      <section id="features" class="how">
        <h2 class="fx-reveal fx-reveal--up">Tu rifa, en 4 pasos.</h2>

        <ol class="how__steps fx-stagger">
          <li class="fx-reveal fx-reveal--left">
            <span class="how__num">1</span>
            <div>
              <h3>Creas tu rifa</h3>
              <p>Nombre, precio por boleta, premios, fechas de sorteo, comisión escalonada. En un solo formulario.</p>
            </div>
          </li>
          <li class="fx-reveal fx-reveal--left">
            <span class="how__num">2</span>
            <div>
              <h3>Generas las boletas</h3>
              <p>El sistema crea automáticamente 500 boletas con 20 números únicos cada una (10.000 números sin repetir).</p>
            </div>
          </li>
          <li class="fx-reveal fx-reveal--left">
            <span class="how__num">3</span>
            <div>
              <h3>Asignas a vendedores</h3>
              <p>Cada vendedor entra desde su celular, ve solo sus boletas, registra clientes y sube comprobantes.</p>
            </div>
          </li>
          <li class="fx-reveal fx-reveal--left">
            <span class="how__num">4</span>
            <div>
              <h3>Confirmas, sorteas y pagas</h3>
              <p>Apruebas pagos, registras ganadores con el número de lotería y el sistema calcula las comisiones a cada vendedor.</p>
            </div>
          </li>
        </ol>
      </section>

      <!-- ============ PARA QUIÉN ES ============ -->
      <section id="roles" class="roles">
        <h2 class="fx-reveal fx-reveal--up">Tres personas, tres experiencias.</h2>
        <p class="muted fx-reveal fx-reveal--up">
          Cada rol entra a su propia vista, sin ver lo que no le corresponde.
        </p>

        <div class="roles__grid fx-stagger">
          <article class="role fx-reveal fx-reveal--up">
            <span class="material-icons role__icon">manage_accounts</span>
            <h3>Si vas a organizar la rifa</h3>
            <p class="role__sub">Dueño / Administrador</p>
            <ul>
              <li>Creas tu rifa con todos los detalles (premios, fechas, lotería con la que juega).</li>
              <li>Generas 500 boletas con 10.000 números únicos en un solo clic.</li>
              <li>Configuras comisiones <strong>escalonadas</strong> (1‑30 boletas: X · 31‑50: Y · 51+: Z).</li>
              <li>Confirmas pagos con comprobante (foto), apruebas o rechazas.</li>
              <li>Registras al ganador del sorteo y notificas a los clientes automáticamente.</li>
              <li>Ves en tiempo real cuántas boletas se vendieron y cuánto debes pagar a cada vendedor.</li>
            </ul>
          </article>

          <article class="role fx-reveal fx-reveal--up">
            <span class="material-icons role__icon">point_of_sale</span>
            <h3>Si vas a vender boletas</h3>
            <p class="role__sub">Vendedor</p>
            <ul>
              <li>Entras desde tu celular con tu cuenta personal.</li>
              <li>Ves solo las boletas que el dueño te asignó — no se mezclan con las de otros.</li>
              <li>Reservas boleta para un cliente con su nombre y teléfono en segundos.</li>
              <li>Subes la foto del pago para que el dueño la confirme.</li>
              <li>Compartes la boleta con tu cliente por WhatsApp con un solo botón.</li>
              <li>Ves <strong>en vivo</strong> cuánto has ganado y cuántas boletas te faltan para subir al siguiente tramo de comisión.</li>
            </ul>
          </article>

          <article class="role fx-reveal fx-reveal--up">
            <span class="material-icons role__icon">verified_user</span>
            <h3>Si compraste una boleta</h3>
            <p class="role__sub">Cliente</p>
            <ul>
              <li>Recibes tu boleta con QR y código único, lista para compartir.</li>
              <li>Escaneas el QR o entras a <a routerLink="/verify"><strong>/verify</strong></a> con tu código → ves el estado real de tu boleta.</li>
              <li>En <a routerLink="/mi-boleta"><strong>/mi-boleta</strong></a> ves todas las boletas que compraste solo con tu teléfono.</li>
              <li>Cada rifa tiene una <a routerLink="/rifa/1"><strong>página pública</strong></a> con el % de venta y la fecha del próximo sorteo.</li>
              <li>Si la rifa se aplaza o se cancela, te avisamos por email con el proceso de reembolso.</li>
              <li>Cero login, cero registro. Solo entras y consultas.</li>
            </ul>
          </article>
        </div>
      </section>

      <!-- ============ PLANES ============ -->
      <section id="planes" class="planes">
        <div class="planes__head">
          <h2 class="fx-reveal fx-reveal--up">Precio negociable. Lo conversamos por WhatsApp.</h2>
          <p class="muted fx-reveal fx-reveal--up">
            Tenemos planes para cada tipo de organizador. Te ofrecemos el que mejor te quede
            según el tamaño de tu rifa y la frecuencia con la que las haces.
          </p>
        </div>

        <div class="planes__grid fx-stagger">
          <article class="plan fx-reveal fx-reveal--up">
            <header class="plan__head">
              <small class="plan__tag">Pago por rifa</small>
              <h3>Una rifa</h3>
              <p class="muted">Ideal si haces 1 rifa al año (o de prueba).</p>
            </header>
            <ul class="plan__features">
              <li><span class="material-icons">check_circle</span>1 rifa activa</li>
              <li><span class="material-icons">check_circle</span>Hasta 500 boletas con QR</li>
              <li><span class="material-icons">check_circle</span>Vendedores ilimitados</li>
              <li><span class="material-icons">check_circle</span>Comisiones escalonadas</li>
              <li><span class="material-icons">check_circle</span>Verificación pública para clientes</li>
              <li><span class="material-icons">check_circle</span>Soporte por email</li>
            </ul>
            <a [href]="whatsappLink('Hola, me interesa el plan POR RIFA. ¿Cuánto cuesta y cómo empiezo?')"
               target="_blank" rel="noopener noreferrer" class="plan__cta">
              Cotizar por WhatsApp
              <svg viewBox="0 0 32 32" fill="currentColor" class="plan__cta-icon">
                <path d="M19.11 17.27c-.27-.13-1.59-.78-1.83-.87-.25-.09-.43-.13-.6.13-.18.27-.7.87-.85 1.04-.16.18-.32.2-.59.07-.27-.13-1.13-.42-2.16-1.34-.8-.71-1.34-1.59-1.49-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.48-.07-.13-.6-1.44-.82-1.97-.21-.52-.43-.45-.6-.46l-.51-.01c-.18 0-.46.07-.7.34-.24.27-.92.9-.92 2.2 0 1.3.94 2.55 1.07 2.73.13.18 1.86 2.84 4.51 3.99 1.74.75 2.42.81 3.28.68.52-.08 1.59-.65 1.81-1.28.22-.62.22-1.16.16-1.27-.07-.11-.24-.18-.51-.31z M16 4C9.37 4 4 9.37 4 16c0 2.11.55 4.16 1.6 5.97L4 28l6.21-1.62A11.94 11.94 0 0 0 16 28c6.63 0 12-5.37 12-12S22.63 4 16 4zm0 21.93c-1.84 0-3.65-.5-5.22-1.45l-.37-.22-3.86 1.01 1.03-3.76-.24-.39A9.96 9.96 0 0 1 6.07 16C6.07 10.52 10.52 6.07 16 6.07S25.93 10.52 25.93 16 21.48 25.93 16 25.93z"/>
              </svg>
            </a>
          </article>

          <article class="plan plan--featured fx-reveal fx-reveal--up">
            <span class="plan__badge">★ Más popular</span>
            <header class="plan__head">
              <small class="plan__tag">Suscripción mensual</small>
              <h3>Mensual</h3>
              <p class="muted">Para quien hace rifas regularmente.</p>
            </header>
            <ul class="plan__features">
              <li><span class="material-icons">check_circle</span>Hasta 3 rifas simultáneas</li>
              <li><span class="material-icons">check_circle</span>Vendedores ilimitados</li>
              <li><span class="material-icons">check_circle</span>Comisiones escalonadas</li>
              <li><span class="material-icons">check_circle</span>Verificación pública + página de rifa</li>
              <li><span class="material-icons">check_circle</span>Reportes y comisiones automáticos</li>
              <li><span class="material-icons">check_circle</span>Soporte por WhatsApp · respuesta &lt; 24h</li>
              <li><span class="material-icons">check_circle</span>Cancela cuando quieras</li>
            </ul>
            <a [href]="whatsappLink('Hola, me interesa el plan MENSUAL. Quiero saber el precio y cómo lo activamos.')"
               target="_blank" rel="noopener noreferrer" class="plan__cta plan__cta--primary">
              Cotizar por WhatsApp
              <svg viewBox="0 0 32 32" fill="currentColor" class="plan__cta-icon">
                <path d="M19.11 17.27c-.27-.13-1.59-.78-1.83-.87-.25-.09-.43-.13-.6.13-.18.27-.7.87-.85 1.04-.16.18-.32.2-.59.07-.27-.13-1.13-.42-2.16-1.34-.8-.71-1.34-1.59-1.49-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.48-.07-.13-.6-1.44-.82-1.97-.21-.52-.43-.45-.6-.46l-.51-.01c-.18 0-.46.07-.7.34-.24.27-.92.9-.92 2.2 0 1.3.94 2.55 1.07 2.73.13.18 1.86 2.84 4.51 3.99 1.74.75 2.42.81 3.28.68.52-.08 1.59-.65 1.81-1.28.22-.62.22-1.16.16-1.27-.07-.11-.24-.18-.51-.31z M16 4C9.37 4 4 9.37 4 16c0 2.11.55 4.16 1.6 5.97L4 28l6.21-1.62A11.94 11.94 0 0 0 16 28c6.63 0 12-5.37 12-12S22.63 4 16 4zm0 21.93c-1.84 0-3.65-.5-5.22-1.45l-.37-.22-3.86 1.01 1.03-3.76-.24-.39A9.96 9.96 0 0 1 6.07 16C6.07 10.52 10.52 6.07 16 6.07S25.93 10.52 25.93 16 21.48 25.93 16 25.93z"/>
              </svg>
            </a>
          </article>

          <article class="plan fx-reveal fx-reveal--up">
            <header class="plan__head">
              <small class="plan__tag">Mejor precio</small>
              <h3>Anual</h3>
              <p class="muted">Para organizaciones que hacen rifas todo el año.</p>
            </header>
            <ul class="plan__features">
              <li><span class="material-icons">check_circle</span><strong>Rifas ilimitadas</strong></li>
              <li><span class="material-icons">check_circle</span>Vendedores y clientes ilimitados</li>
              <li><span class="material-icons">check_circle</span>Comisiones escalonadas avanzadas</li>
              <li><span class="material-icons">check_circle</span>Reportes exportables (próximamente)</li>
              <li><span class="material-icons">check_circle</span>Soporte prioritario directo</li>
              <li><span class="material-icons">check_circle</span>Capacitación a tus vendedores</li>
              <li><span class="material-icons">check_circle</span>Mejor tarifa por mes</li>
            </ul>
            <a [href]="whatsappLink('Hola, quiero conocer el plan ANUAL. Cuéntenme qué incluye y el precio.')"
               target="_blank" rel="noopener noreferrer" class="plan__cta">
              Cotizar por WhatsApp
              <svg viewBox="0 0 32 32" fill="currentColor" class="plan__cta-icon">
                <path d="M19.11 17.27c-.27-.13-1.59-.78-1.83-.87-.25-.09-.43-.13-.6.13-.18.27-.7.87-.85 1.04-.16.18-.32.2-.59.07-.27-.13-1.13-.42-2.16-1.34-.8-.71-1.34-1.59-1.49-1.86-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.13-.16.18-.27.27-.45.09-.18.04-.34-.02-.48-.07-.13-.6-1.44-.82-1.97-.21-.52-.43-.45-.6-.46l-.51-.01c-.18 0-.46.07-.7.34-.24.27-.92.9-.92 2.2 0 1.3.94 2.55 1.07 2.73.13.18 1.86 2.84 4.51 3.99 1.74.75 2.42.81 3.28.68.52-.08 1.59-.65 1.81-1.28.22-.62.22-1.16.16-1.27-.07-.11-.24-.18-.51-.31z M16 4C9.37 4 4 9.37 4 16c0 2.11.55 4.16 1.6 5.97L4 28l6.21-1.62A11.94 11.94 0 0 0 16 28c6.63 0 12-5.37 12-12S22.63 4 16 4zm0 21.93c-1.84 0-3.65-.5-5.22-1.45l-.37-.22-3.86 1.01 1.03-3.76-.24-.39A9.96 9.96 0 0 1 6.07 16C6.07 10.52 10.52 6.07 16 6.07S25.93 10.52 25.93 16 21.48 25.93 16 25.93z"/>
              </svg>
            </a>
          </article>
        </div>

        <p class="planes__note muted fx-reveal fx-reveal--up">
          💡 Todos los planes incluyen actualizaciones gratis, hosting, backups diarios y soporte en español.
          Pago en pesos colombianos, transferencia bancaria o Nequi.
        </p>
      </section>

      <!-- ============ VERIFICA TU BOLETA ============ -->
      <section class="verify-card-wrap">
        <div class="verify-card fx-reveal fx-reveal--zoom">
          <div class="verify-card__icon">
            <span class="material-icons">qr_code_2</span>
          </div>
          <div class="verify-card__body">
            <small class="verify-card__label">¿Tienes una boleta?</small>
            <h2>Verifícala en segundos</h2>
            <p class="muted">
              Si te dieron una boleta de cualquier rifa que use Boletera, puedes confirmar
              que es auténtica con un solo clic. Sin login, sin instalar nada.
            </p>
          </div>
          <div class="verify-card__actions">
            <a routerLink="/verify" class="verify-card__cta verify-card__cta--primary">
              <span class="material-icons">verified</span>
              Verificar con código
            </a>
            <a routerLink="/mi-boleta" class="verify-card__cta">
              <span class="material-icons">phone_iphone</span>
              Ver todas mis boletas
            </a>
          </div>
        </div>
      </section>

      <!-- ============ FAQ ============ -->
      <section id="faq" class="faq">
        <h2 class="fx-reveal fx-reveal--up">Preguntas frecuentes</h2>

        <div class="faq__grid fx-stagger">
          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Cómo se cobra el software?</summary>
            <p class="muted">
              Tenemos tres modalidades: pago por rifa, mensual o anual. El precio es
              negociable según el tamaño de tu operación. Cotizar es gratis y sin
              compromiso — escríbenos por WhatsApp.
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Necesito conocimientos técnicos?</summary>
            <p class="muted">
              No. Si sabes usar WhatsApp, sabes usar Boletera. Lo configuras desde el
              celular o el computador. Si te trabas, te ayudamos en el proceso.
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Mis vendedores pueden trabajar desde su celular?</summary>
            <p class="muted">
              Sí. Cada vendedor tiene su propia cuenta y ve solo sus boletas. La app
              funciona en cualquier celular Android o iPhone con internet. También
              pueden instalarla como app desde el navegador (PWA).
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Cómo evita que dos vendedores vendan la misma boleta?</summary>
            <p class="muted">
              Cuando un vendedor reserva una boleta, queda bloqueada para los demás
              automáticamente. Si el cliente no paga en 24 horas, vuelve a estar
              disponible.
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Y si necesito aplazar o cancelar la rifa?</summary>
            <p class="muted">
              Puedes hacerlo desde el panel. Si aplazas, Boletera envía un email a
              cada cliente pagado con la nueva fecha. Si cancelas, envía un email
              empático con los datos de reembolso que tú configures.
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Mis datos están seguros?</summary>
            <p class="muted">
              Tus datos están aislados de cualquier otro negocio que use Boletera —
              no podemos mezclarlos. Las contraseñas se guardan encriptadas. Cada
              acción queda registrada en una auditoría inmutable.
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Cómo funciona la comisión de los vendedores?</summary>
            <p class="muted">
              Tú defines tramos: por ejemplo, 1‑30 boletas vendidas pagas $3.000 cada
              una, de 31 a 50 pagas $4.000, y de 51 en adelante $5.000. Cuando un
              vendedor cruza un tramo, Boletera recalcula automáticamente lo que le
              debes pagar.
            </p>
          </details>

          <details class="faq__item fx-reveal fx-reveal--up">
            <summary>¿Qué pasa si me retraso con el pago de la suscripción?</summary>
            <p class="muted">
              Tienes 7 días de gracia en modo solo lectura (ves tu data pero no la
              puedes modificar). Después se bloquea el login, pero <strong>tu data
              nunca se borra</strong>. Cuando renueves, vuelves a tener acceso completo
              al instante.
            </p>
          </details>
        </div>
      </section>

      <!-- ============ CTA FINAL ============ -->
      <section class="cta">
        <div class="cta__card fx-reveal fx-reveal--zoom">
          <h2>Deja de administrar rifas con Excel y WhatsApp.</h2>
          <p>Empieza a vender con la confianza de un sistema profesional.</p>
          <app-button variant="primary" size="lg" icon="rocket_launch" (click)="goToLogin()">
            {{ ctaLabel() }}
          </app-button>
        </div>
      </section>

      <footer class="footer fx-reveal fx-reveal--up">
        <div class="footer__inner">
          <div class="footer__brand">
            <strong>🎟️ Boletera</strong>
            <small>Tu rifa, profesional desde el primer ticket.</small>
          </div>

          <div class="footer__links">
            <div>
              <h4>Producto</h4>
              <a href="#beneficios">Funcionalidades</a>
              <a href="#features">Cómo funciona</a>
              <a href="#planes">Planes</a>
              <a href="#faq">Preguntas frecuentes</a>
            </div>
            <div>
              <h4>Para clientes</h4>
              <a routerLink="/verify">Verificar boleta</a>
              <a routerLink="/mi-boleta">Ver mis boletas</a>
            </div>
            <div>
              <h4>Contacto</h4>
              <a [href]="whatsappLink('Hola Boletera, quiero más información.')" target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <a href="mailto:deimerromeromadera&#64;gmail.com">Email</a>
              <a routerLink="/login">Iniciar sesión</a>
            </div>
          </div>
        </div>

        <div class="footer__bottom">
          <small>© 2026 Boletera · Hecho en Colombia 🇨🇴</small>
          <small class="footer__legal">Versión {{ version }}</small>
        </div>
      </footer>
    </main>

    <!-- Botón flotante de WhatsApp visible en toda la landing -->
    <app-whatsapp-button />
  `,
  styles: [`
    :host {
      --landing-max: 1080px;
      display: block;
    }
    .landing {
      background: var(--bg-base);
      color: var(--text);
      min-height: 100dvh;
      overflow-x: hidden;
    }

    /* ============ NAV ============ */
    .nav {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-4) var(--s-4);
      display: flex;
      align-items: center;
      gap: var(--s-4);
      justify-content: space-between;
    }
    .brand {
      display: inline-flex; align-items: center; gap: 8px;
      text-decoration: none; color: var(--text);
    }
    .brand__logo { font-size: 22px; }
    .brand__name { font-size: 18px; font-weight: 800; letter-spacing: -0.02em; }
    .nav__links { display: flex; gap: var(--s-4); }
    .nav__links a { color: var(--text-muted); text-decoration: none; font-size: 14px; }
    .nav__links a:hover { color: var(--accent); }
    .nav__actions { display: flex; gap: var(--s-2); align-items: center; }
    @media (max-width: 720px) {
      .nav__links { display: none; }
    }

    /* ============ HERO ============ */
    .hero {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-6) var(--s-4) var(--s-7);
      display: grid;
      grid-template-columns: 1.2fr 1fr;
      gap: var(--s-6);
      align-items: center;
    }
    @media (max-width: 900px) {
      .hero { grid-template-columns: 1fr; }
      .hero__art { display: none; }
    }
    .hero__badge {
      display: inline-block;
      background: var(--accent-soft);
      color: var(--accent);
      padding: 4px 10px;
      border-radius: var(--r-full);
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-bottom: var(--s-3);
    }
    .hero h1 {
      font-size: clamp(32px, 6vw, 52px);
      line-height: 1.05;
      letter-spacing: -0.03em;
      margin: 0 0 var(--s-3);
      font-weight: 800;
    }
    .accent { color: var(--accent); }
    .hero__tagline {
      font-size: 17px;
      color: var(--text-muted);
      line-height: 1.55;
      max-width: 540px;
      margin: 0 0 var(--s-5);
    }
    .hero__ctas {
      display: flex;
      gap: var(--s-3);
      align-items: center;
      margin-bottom: var(--s-3);
      flex-wrap: wrap;
    }
    .hero__secondary {
      display: inline-flex; align-items: center; gap: 6px;
      color: var(--text); text-decoration: none;
      font-weight: 500; font-size: 14px;
      padding: 8px 12px;
    }
    .hero__secondary:hover { color: var(--accent); }
    .hero__trust { font-size: 13px; color: var(--text-muted); margin: 0; }

    /* ============ HERO ART (ticket mock) ============ */
    .hero__art { display: grid; place-items: center; }
    .ticket {
      width: 320px;
      background: linear-gradient(160deg, var(--bg-surface), var(--bg-base));
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      box-shadow: var(--shadow-lg);
      transform: rotate(-3deg);
      display: grid; gap: var(--s-3);
    }
    .ticket__head {
      display: flex; justify-content: space-between; align-items: center;
      padding-bottom: var(--s-2);
      border-bottom: 1px dashed var(--border);
    }
    .ticket__label { font-weight: 800; color: var(--accent); font-size: 18px; }
    .ticket__code { font-family: monospace; color: var(--text-muted); font-size: 13px; }
    .ticket__nums { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px; }
    .ticket__num {
      background: var(--accent);
      color: var(--accent-fg);
      padding: 6px 0;
      border-radius: var(--r-sm);
      text-align: center;
      font-weight: 700;
      font-size: 12px;
      font-variant-numeric: tabular-nums;
    }
    .ticket__foot { color: var(--text-muted); font-size: 12px; text-align: center; }

    /* ============ FEATURES ============ */
    .features, .how {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-7) var(--s-4);
    }
    .features h2, .how h2, .cta h2 {
      font-size: clamp(26px, 4vw, 36px);
      letter-spacing: -0.02em;
      margin: 0 0 var(--s-2);
      font-weight: 700;
    }
    .muted { color: var(--text-muted); margin: 0 0 var(--s-5); font-size: 16px; }
    .feature-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
      gap: var(--s-3);
    }
    .feature {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-4);
      display: grid;
      gap: 8px;
      transition: transform var(--t-fast), border-color var(--t-fast);
    }
    .feature:hover { transform: translateY(-2px); border-color: var(--accent); }
    .feature .material-icons {
      font-size: 28px;
      color: var(--accent);
      background: var(--accent-soft);
      width: 48px; height: 48px;
      border-radius: var(--r-md);
      display: grid; place-items: center;
    }
    .feature h3 { margin: 4px 0 0; font-size: 16px; }
    .feature p { color: var(--text-muted); font-size: 14px; line-height: 1.55; margin: 0; }

    /* ============ HOW ============ */
    .how__steps {
      list-style: none; padding: 0; margin: 0;
      display: grid; gap: var(--s-4);
    }
    .how__steps li {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: var(--s-3);
      align-items: start;
      padding: var(--s-4);
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
    }
    .how__num {
      width: 40px; height: 40px;
      border-radius: 50%;
      background: var(--accent);
      color: var(--accent-fg);
      display: grid; place-items: center;
      font-weight: 800;
      font-size: 18px;
    }
    .how__steps h3 { margin: 0 0 4px; font-size: 16px; }
    .how__steps p { color: var(--text-muted); font-size: 14px; line-height: 1.55; margin: 0; }

    /* ============ CTA ============ */
    .cta {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-5) var(--s-4) var(--s-7);
    }
    .cta__card {
      background: linear-gradient(135deg, var(--accent-soft), var(--bg-surface));
      border: 1px solid var(--accent);
      border-radius: var(--r-xl);
      padding: var(--s-7) var(--s-5);
      text-align: center;
      display: grid;
      gap: var(--s-3);
      justify-items: center;
    }
    .cta__card p { color: var(--text); font-size: 16px; margin: 0; }

    /* ============ FOOTER ============ */
    .footer {
      border-top: 1px solid var(--border);
      background: var(--bg-surface);
    }
    .footer__inner {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-4);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--s-3);
      flex-wrap: wrap;
    }
    .footer__inner small { display: block; color: var(--text-muted); font-size: 12px; margin-top: 2px; }
    .footer__copy { color: var(--text-muted); font-size: 12px; }

    /* ===================================================
       MOTION DESIGN
       =================================================== */

    /* --- Blobs decorativos detrás del hero ---
       overflow visible a propósito: el blur 120px no se debe cortar contra
       un rectángulo (eso es lo que generaba el "recuadro" visible). Como
       .landing ya tiene overflow-x: hidden, no hay scroll horizontal, y
       el bleed vertical hacia features se funde naturalmente porque
       ambas secciones comparten el mismo fondo. */
    .hero { position: relative; contain: layout style paint; }
    .hero__bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .hero__content, .hero__art { position: relative; z-index: 1; }
    .blob {
      position: absolute;
      width: 320px; height: 320px;
      border-radius: 50%;
      filter: blur(45px);
      opacity: 0.42;
      will-change: transform;
      transform: translate3d(0, 0, 0);
    }
    .blob--1 {
      background: var(--accent);
      top: -80px; right: -60px;
      animation: blob-drift-1 18s ease-in-out infinite;
    }
    .blob--2 {
      background: var(--info);
      bottom: -120px; left: -90px;
      opacity: 0.26;
      animation: blob-drift-2 22s ease-in-out infinite;
    }
    @keyframes blob-drift-1 {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      33%      { transform: translate3d(30px, 20px, 0) scale(1.05); }
      66%      { transform: translate3d(-20px, 40px, 0) scale(0.97); }
    }
    @keyframes blob-drift-2 {
      0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
      40%      { transform: translate3d(-35px, -20px, 0) scale(1.06); }
      80%      { transform: translate3d(30px, -35px, 0) scale(0.95); }
    }

    /* --- Hero: entrada secuencial --- */
    .fx-hero {
      opacity: 0;
      transform: translateY(20px);
      animation: hero-fade-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) forwards;
    }
    .fx-hero--1 { animation-delay: 0.05s; }
    .fx-hero--2 { animation-delay: 0.15s; }
    .fx-hero--3 { animation-delay: 0.30s; }
    .fx-hero--4 { animation-delay: 0.45s; }
    .fx-hero--5 { animation-delay: 0.60s; }

    @keyframes hero-fade-up {
      to { opacity: 1; transform: translateY(0); }
    }

    /* --- Badge: pulso muy sutil --- */
    .hero__badge {
      animation: hero-fade-up 0.7s cubic-bezier(0.2, 0.8, 0.2, 1) 0.05s forwards,
                 badge-pulse 3s ease-in-out 1.5s infinite;
    }
    @keyframes badge-pulse {
      0%, 100% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 35%, transparent); }
      50%      { box-shadow: 0 0 0 6px color-mix(in srgb, var(--accent) 0%,  transparent); }
    }

    /* --- Ticket: entrada deslizada + float continuo --- */
    .ticket-enter {
      animation: ticket-enter 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) 0.35s backwards;
      will-change: transform, opacity;
    }
    @keyframes ticket-enter {
      from { opacity: 0; transform: translateX(60px); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .ticket-float {
      animation: ticket-float 4.5s ease-in-out 1.4s infinite;
      will-change: transform;
    }
    @keyframes ticket-float {
      0%, 100% { transform: translateY(0); }
      50%      { transform: translateY(-8px); }
    }

    /* --- Números de la boleta: uno se ilumina cada rato (efecto "se acaba de vender") --- */
    .ticket__num {
      animation: num-spark 8s ease-in-out infinite;
      will-change: transform, background-color;
    }
    .ticket__num:nth-child(1)  { animation-delay: 0.2s; }
    .ticket__num:nth-child(2)  { animation-delay: 1.3s; }
    .ticket__num:nth-child(3)  { animation-delay: 2.7s; }
    .ticket__num:nth-child(4)  { animation-delay: 4.1s; }
    .ticket__num:nth-child(5)  { animation-delay: 5.5s; }
    .ticket__num:nth-child(6)  { animation-delay: 0.8s; }
    .ticket__num:nth-child(7)  { animation-delay: 2.2s; }
    .ticket__num:nth-child(8)  { animation-delay: 3.6s; }
    .ticket__num:nth-child(9)  { animation-delay: 5.0s; }
    .ticket__num:nth-child(10) { animation-delay: 6.4s; }
    @keyframes num-spark {
      0%, 92%, 100% { background: var(--accent); color: var(--accent-fg); transform: scale(1); }
      94%           { background: #f5b400;       color: #1f1500;          transform: scale(1.1); }
      96%           { background: #f5b400;       color: #1f1500;          transform: scale(1.05); }
    }

    /* --- Brand: wiggle del 🎟️ en hover --- */
    .brand:hover .brand__logo {
      animation: brand-wiggle 0.6s ease-in-out;
      display: inline-block;
    }
    @keyframes brand-wiggle {
      0%, 100% { transform: rotate(0deg); }
      25%      { transform: rotate(-10deg); }
      75%      { transform: rotate(10deg); }
    }

    /* --- Scroll reveals (controlados por IntersectionObserver) --- */
    .fx-reveal {
      opacity: 0;
      transition:
        opacity 0.7s cubic-bezier(0.2, 0.8, 0.2, 1),
        transform 0.7s cubic-bezier(0.2, 0.8, 0.2, 1);
      will-change: opacity, transform;
    }
    .fx-reveal--up   { transform: translateY(28px); }
    .fx-reveal--left { transform: translateX(-32px); }
    .fx-reveal--zoom { transform: scale(0.94); }

    .fx-reveal.is-visible {
      opacity: 1;
      transform: translateY(0) translateX(0) scale(1);
    }

    /* Stagger automático para hijos directos del .fx-stagger */
    .fx-stagger > *:nth-child(1) { transition-delay: 0ms; }
    .fx-stagger > *:nth-child(2) { transition-delay: 80ms; }
    .fx-stagger > *:nth-child(3) { transition-delay: 160ms; }
    .fx-stagger > *:nth-child(4) { transition-delay: 240ms; }
    .fx-stagger > *:nth-child(5) { transition-delay: 320ms; }
    .fx-stagger > *:nth-child(6) { transition-delay: 400ms; }

    /* --- Hover de feature cards y how steps (micro-interacciones) --- */
    .feature {
      transition:
        transform 0.25s ease,
        border-color 0.25s ease,
        box-shadow 0.25s ease;
    }
    .feature:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
      box-shadow: 0 14px 30px -10px color-mix(in srgb, var(--accent) 30%, transparent);
    }
    .feature .material-icons { transition: transform 0.3s ease; }
    .feature:hover .material-icons { transform: rotate(6deg) scale(1.08); }

    .how__steps li {
      transition: transform 0.25s ease, border-color 0.25s ease;
    }
    .how__steps li:hover {
      transform: translateX(4px);
      border-color: var(--accent);
    }

    /* CTA secundario: el ícono play_circle rota en hover */
    .hero__secondary .material-icons { transition: transform 0.3s ease; }
    .hero__secondary:hover .material-icons { transform: rotate(90deg); }

    /* ============ ROLES (Para quién es) ============ */
    .roles {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-7) var(--s-4);
    }
    .roles h2 {
      font-size: clamp(26px, 4vw, 36px);
      letter-spacing: -0.02em;
      margin: 0 0 var(--s-2);
      font-weight: 700;
    }
    .roles__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--s-3);
      margin-top: var(--s-4);
    }
    .role {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-5);
      display: grid;
      gap: var(--s-2);
      transition: transform 0.25s ease, border-color 0.25s ease, box-shadow 0.25s ease;
    }
    .role:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
      box-shadow: 0 14px 36px -12px color-mix(in srgb, var(--accent) 30%, transparent);
    }
    .role__icon {
      width: 56px; height: 56px;
      background: var(--accent-soft); color: var(--accent);
      border-radius: var(--r-md);
      display: grid; place-items: center;
      font-size: 30px !important;
    }
    .role h3 {
      margin: var(--s-2) 0 0;
      font-size: 18px;
    }
    .role__sub {
      margin: 0;
      font-size: 12px;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 600;
    }
    .role ul {
      list-style: none;
      padding: 0;
      margin: var(--s-3) 0 0;
      display: grid;
      gap: 8px;
    }
    .role li {
      font-size: 13.5px;
      color: var(--text);
      line-height: 1.5;
      padding-left: 18px;
      position: relative;
    }
    .role li::before {
      content: '✓';
      color: var(--accent);
      font-weight: 700;
      position: absolute;
      left: 0;
    }
    .role a { color: var(--accent); font-weight: 600; }

    /* ============ PLANES ============ */
    .planes {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-7) var(--s-4);
    }
    .planes__head { text-align: center; max-width: 720px; margin: 0 auto var(--s-5); }
    .planes h2 {
      font-size: clamp(26px, 4vw, 36px);
      letter-spacing: -0.02em;
      margin: 0 0 var(--s-2);
      font-weight: 700;
    }
    .planes__grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: var(--s-3);
      align-items: stretch;
    }
    .plan {
      position: relative;
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-lg);
      padding: var(--s-5);
      display: flex;
      flex-direction: column;
      gap: var(--s-4);
      transition: transform 0.25s ease, border-color 0.25s ease;
    }
    .plan:hover {
      transform: translateY(-4px);
      border-color: var(--accent);
    }
    .plan--featured {
      border-color: var(--accent);
      border-width: 2px;
      background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--bg-surface)), var(--bg-surface));
      box-shadow: 0 16px 40px -16px color-mix(in srgb, var(--accent) 35%, transparent);
    }
    .plan__badge {
      position: absolute;
      top: -14px; left: 50%;
      transform: translateX(-50%);
      background: var(--accent);
      color: var(--accent-fg);
      padding: 5px 14px;
      border-radius: var(--r-full);
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .plan__head { display: grid; gap: 4px; }
    .plan__tag {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--accent);
      font-weight: 700;
    }
    .plan__head h3 { margin: 0; font-size: 22px; }
    .plan__features {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 10px;
      flex: 1;
    }
    .plan__features li {
      display: flex;
      gap: 8px;
      align-items: flex-start;
      font-size: 14px;
      color: var(--text);
      line-height: 1.45;
    }
    .plan__features .material-icons {
      font-size: 18px;
      color: var(--accent);
      flex-shrink: 0;
      margin-top: 1px;
    }
    .plan__cta {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 12px 16px;
      background: transparent;
      color: var(--text);
      border: 1px solid var(--border-strong);
      border-radius: var(--r-md);
      font-weight: 600;
      font-size: 14px;
      text-decoration: none;
      transition: background 0.2s ease, border-color 0.2s ease, transform 0.2s ease;
    }
    .plan__cta:hover {
      background: #25d36615;
      border-color: #25d366;
      transform: translateY(-1px);
    }
    .plan__cta--primary {
      background: linear-gradient(135deg, #25d366, #128c7e);
      color: #fff;
      border-color: transparent;
    }
    .plan__cta--primary:hover {
      background: linear-gradient(135deg, #1ec85a, #0e6b60);
      color: #fff;
      box-shadow: 0 8px 18px -6px rgba(37, 211, 102, 0.5);
    }
    .plan__cta-icon { width: 18px; height: 18px; flex-shrink: 0; }

    .planes__note {
      margin-top: var(--s-5);
      text-align: center;
      font-size: 13px;
      max-width: 640px;
      margin-left: auto;
      margin-right: auto;
      padding: 0 var(--s-4);
    }

    /* ============ VERIFY CARD ============ */
    .verify-card-wrap {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-5) var(--s-4);
    }
    .verify-card {
      background: linear-gradient(135deg, color-mix(in srgb, var(--info) 12%, var(--bg-surface)), var(--bg-surface));
      border: 1px solid var(--info);
      border-radius: var(--r-xl);
      padding: var(--s-5);
      display: grid;
      grid-template-columns: auto 1fr auto;
      gap: var(--s-4);
      align-items: center;
    }
    .verify-card__icon {
      width: 72px; height: 72px;
      background: var(--info); color: white;
      border-radius: var(--r-lg);
      display: grid; place-items: center;
      flex-shrink: 0;
    }
    .verify-card__icon .material-icons { font-size: 36px; }
    .verify-card__body { display: grid; gap: 4px; }
    .verify-card__label {
      font-size: 11px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--info);
      font-weight: 700;
    }
    .verify-card h2 {
      font-size: 22px;
      margin: 2px 0;
    }
    .verify-card .muted { font-size: 14px; margin: 0; }
    .verify-card__actions { display: flex; gap: var(--s-2); flex-wrap: wrap; }
    .verify-card__cta {
      display: inline-flex; align-items: center; gap: 6px;
      padding: 10px 14px;
      background: var(--bg-base); color: var(--text);
      border: 1px solid var(--border-strong);
      border-radius: var(--r-md);
      font-weight: 600; font-size: 13px;
      text-decoration: none;
      transition: background 0.2s ease, border-color 0.2s ease;
    }
    .verify-card__cta:hover { background: var(--bg-hover); border-color: var(--accent); color: var(--accent); }
    .verify-card__cta--primary { background: var(--accent); color: var(--accent-fg); border-color: var(--accent); }
    .verify-card__cta--primary:hover { background: var(--accent-hover); color: var(--accent-fg); border-color: var(--accent-hover); }
    .verify-card__cta .material-icons { font-size: 16px; }

    @media (max-width: 720px) {
      .verify-card { grid-template-columns: 1fr; text-align: left; }
      .verify-card__icon { width: 56px; height: 56px; }
      .verify-card__icon .material-icons { font-size: 28px; }
    }

    /* ============ FAQ ============ */
    .faq {
      max-width: 880px;
      margin: 0 auto;
      padding: var(--s-7) var(--s-4);
    }
    .faq h2 {
      font-size: clamp(26px, 4vw, 36px);
      letter-spacing: -0.02em;
      margin: 0 0 var(--s-5);
      font-weight: 700;
      text-align: center;
    }
    .faq__grid { display: grid; gap: var(--s-2); }
    .faq__item {
      background: var(--bg-surface);
      border: 1px solid var(--border);
      border-radius: var(--r-md);
      overflow: hidden;
      transition: border-color 0.2s ease;
    }
    .faq__item[open] { border-color: var(--accent); }
    .faq__item summary {
      cursor: pointer;
      padding: var(--s-4);
      font-weight: 600;
      font-size: 15px;
      color: var(--text);
      display: flex;
      justify-content: space-between;
      align-items: center;
      list-style: none;
    }
    .faq__item summary::-webkit-details-marker { display: none; }
    .faq__item summary::after {
      content: '+';
      font-size: 22px;
      color: var(--accent);
      font-weight: 400;
      transition: transform 0.2s ease;
      flex-shrink: 0;
      margin-left: var(--s-3);
    }
    .faq__item[open] summary::after { content: '−'; transform: rotate(0deg); }
    .faq__item p {
      padding: 0 var(--s-4) var(--s-4);
      margin: 0;
      font-size: 14px;
      line-height: 1.55;
    }

    /* ============ FOOTER mejorado ============ */
    .footer__brand strong { display: block; font-size: 16px; }
    .footer__brand small { display: block; color: var(--text-muted); font-size: 12px; margin-top: 4px; }
    .footer__links {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: var(--s-4);
      flex: 1;
    }
    .footer__links h4 {
      margin: 0 0 8px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      font-weight: 700;
    }
    .footer__links a {
      display: block;
      color: var(--text);
      text-decoration: none;
      font-size: 13px;
      padding: 3px 0;
      transition: color 0.15s ease;
    }
    .footer__links a:hover { color: var(--accent); }

    .footer__inner {
      display: grid;
      grid-template-columns: minmax(180px, 1fr) 2fr;
      gap: var(--s-5);
      align-items: flex-start;
    }
    .footer__bottom {
      max-width: var(--landing-max);
      margin: 0 auto;
      padding: var(--s-4);
      border-top: 1px solid var(--border);
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: var(--s-3);
      flex-wrap: wrap;
    }
    .footer__bottom small { font-size: 12px; color: var(--text-muted); }
    .footer__legal { letter-spacing: 0.04em; }

    @media (max-width: 720px) {
      .footer__inner { grid-template-columns: 1fr; }
    }

    /* --- prefers-reduced-motion: desactiva TODO --- */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: 0.001ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: 0.001ms !important;
        scroll-behavior: auto !important;
      }
      .fx-reveal { opacity: 1 !important; transform: none !important; }
      .fx-hero   { opacity: 1 !important; transform: none !important; }
      .blob      { animation: none !important; }
    }
  `],
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly host: ElementRef<HTMLElement> = inject(ElementRef);
  private readonly platformId = inject(PLATFORM_ID);
  private observer?: IntersectionObserver;

  readonly demoNumbers = ['0421', '1837', '2604', '3719', '4250', '5183', '6042', '7271', '8540', '9617'];
  readonly version = environment.version;

  /** Genera un link de WhatsApp con mensaje pre-llenado. */
  whatsappLink(message?: string): string {
    const text = encodeURIComponent(message ?? environment.whatsappDefaultMessage);
    return `https://wa.me/${environment.whatsappNumber}?text=${text}`;
  }

  ctaLabel(): string {
    // El texto cambia, pero el destino siempre es /login. Si el usuario
    // YA tiene sesión válida, el guestGuard de /login lo rebota a su
    // landing por rol. Si la sesión está caducada/inválida, el guard la
    // limpia y muestra el formulario. Esto evita un baile de redirects
    // cuando hay un token viejo en localStorage.
    return this.auth.isAuthenticated() ? 'Ir al panel' : 'Iniciar sesión';
  }

  goToLogin() {
    this.router.navigate(['/login']);
  }

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    const root = this.host.nativeElement;
    const targets = Array.from(root.querySelectorAll<HTMLElement>('.fx-reveal'));

    // Si el usuario pidió menos movimiento, mostrar todo de una sin animar.
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || !('IntersectionObserver' in window)) {
      targets.forEach((el) => el.classList.add('is-visible'));
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
            this.observer?.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.15, rootMargin: '0px 0px -60px 0px' },
    );

    targets.forEach((el) => this.observer!.observe(el));
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}
