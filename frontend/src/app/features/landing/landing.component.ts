import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID, inject,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '@core/services/auth.service';
import { ButtonComponent, ThemeToggleComponent } from '@shared/ui';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, ButtonComponent, ThemeToggleComponent],
  template: `
    <main class="landing">
      <header class="nav">
        <a routerLink="/" class="brand" aria-label="Boletera">
          <span class="brand__logo">🎟️</span>
          <strong class="brand__name">Boletera</strong>
        </a>
        <nav class="nav__links">
          <a href="#features">Cómo funciona</a>
          <a href="#beneficios">Beneficios</a>
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
          <div>
            <strong>🎟️ Boletera</strong>
            <small>Tu rifa, profesional desde el primer ticket.</small>
          </div>
          <small class="footer__copy">© 2026 Boletera · Hecho en Colombia 🇨🇴</small>
        </div>
      </footer>
    </main>
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
    .hero { position: relative; }
    .hero__bg {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
    }
    .hero__content, .hero__art { position: relative; z-index: 1; }
    .blob {
      position: absolute;
      width: 420px; height: 420px;
      border-radius: 50%;
      filter: blur(110px);
      opacity: 0.32;
      will-change: transform;
    }
    .blob--1 {
      background: var(--accent);
      top: -120px; right: -80px;
      animation: blob-drift-1 18s ease-in-out infinite;
    }
    .blob--2 {
      background: var(--info);
      bottom: -160px; left: -120px;
      opacity: 0.18;
      animation: blob-drift-2 22s ease-in-out infinite;
    }
    @keyframes blob-drift-1 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      33%      { transform: translate(40px, 30px) scale(1.06); }
      66%      { transform: translate(-30px, 60px) scale(0.96); }
    }
    @keyframes blob-drift-2 {
      0%, 100% { transform: translate(0, 0) scale(1); }
      40%      { transform: translate(-50px, -30px) scale(1.08); }
      80%      { transform: translate(40px, -50px) scale(0.94); }
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

  ctaLabel(): string {
    return this.auth.accessToken ? 'Ir al panel' : 'Iniciar sesión';
  }

  goToLogin() {
    this.router.navigate([this.auth.accessToken ? this.auth.landingPath() : '/login']);
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
