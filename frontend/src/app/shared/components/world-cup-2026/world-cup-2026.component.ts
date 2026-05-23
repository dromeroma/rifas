import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  AfterViewInit, Component, ElementRef, OnDestroy, PLATFORM_ID,
  ViewChild, inject, input,
} from '@angular/core';

/**
 * Capa decorativa Mundial 2026 — SVGs flotantes + confetti one-shot.
 *
 * Modos:
 *  - 'hero':    decoración inmersiva para hero del landing (balones, trofeo, líneas de cancha)
 *  - 'banner':  versión compacta para usar dentro de banners/secciones
 *  - 'corner':  solo un balón discreto en esquina (login, headers menores)
 *
 * Confetti:
 *  - `confetti="true"` dispara una caída one-shot (3s) al montar el componente
 *  - Se guarda flag en sessionStorage para no repetir si el usuario navega
 *    dentro de la SPA durante la misma sesión.
 */
@Component({
  selector: 'app-world-cup-2026',
  standalone: true,
  imports: [CommonModule],
  host: {
    // Refleja el modo como atributo data-* del host para usarlo en :host([data-mode='...']).
    '[attr.data-mode]': 'mode()',
  },
  template: `
    @if (mode() !== 'corner') {
      <div class="wc" [class.wc--banner]="mode() === 'banner'" aria-hidden="true">
        <!-- Definitions compartidas -->
        <svg class="wc-defs" aria-hidden="true">
          <defs>
            <radialGradient id="wcBallShade" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
              <stop offset="80%" stop-color="#f3f3f3" stop-opacity="1"/>
              <stop offset="100%" stop-color="#c8c8c8" stop-opacity="1"/>
            </radialGradient>
            <linearGradient id="wcGold" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stop-color="#ffd95a"/>
              <stop offset="50%" stop-color="#f0b400"/>
              <stop offset="100%" stop-color="#b87a00"/>
            </linearGradient>
            <linearGradient id="wcHorn" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#fbbf24"/>
              <stop offset="55%" stop-color="#f59e0b"/>
              <stop offset="100%" stop-color="#b45309"/>
            </linearGradient>
          </defs>
        </svg>

        <!-- Balón principal — asoma desde el borde superior derecho del hero -->
        <svg class="wc-ball wc-ball--main" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="46" fill="url(#wcBallShade)" stroke="#1a1a1a" stroke-width="1.5"/>
          <polygon points="50,22 62,32 58,46 42,46 38,32" fill="#1a1a1a"/>
          <polygon points="22,52 33,46 42,55 38,68 26,66" fill="#1a1a1a"/>
          <polygon points="78,52 67,46 58,55 62,68 74,66" fill="#1a1a1a"/>
          <line x1="50" y1="46" x2="50" y2="55" stroke="#1a1a1a" stroke-width="1.5"/>
          <line x1="42" y1="46" x2="33" y2="46" stroke="#1a1a1a" stroke-width="1.5"/>
          <line x1="58" y1="46" x2="67" y2="46" stroke="#1a1a1a" stroke-width="1.5"/>
        </svg>

        @if (mode() === 'hero') {
          <!-- Balón mediano — asoma desde el borde derecho del hero -->
          <svg class="wc-ball wc-ball--small" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="url(#wcBallShade)" stroke="#1a1a1a" stroke-width="1.5"/>
            <polygon points="50,22 62,32 58,46 42,46 38,32" fill="#1a1a1a"/>
            <polygon points="22,52 33,46 42,55 38,68 26,66" fill="#1a1a1a"/>
            <polygon points="78,52 67,46 58,55 62,68 74,66" fill="#1a1a1a"/>
          </svg>

          <!-- Trofeo — asoma desde el borde inferior derecho del hero -->
          <svg class="wc-trophy" viewBox="0 0 64 64">
            <g fill="url(#wcGold)" stroke="#7a4f00" stroke-width="0.8">
              <path d="M22 8h20v4c0 8-3 14-10 16-7-2-10-8-10-16V8z"/>
              <path d="M14 12h8v4c0 4 2 7 5 8-4 1-9-1-11-5-1-2-2-4-2-7z"/>
              <path d="M50 12h-8v4c0 4-2 7-5 8 4 1 9-1 11-5 1-2 2-4 2-7z"/>
              <rect x="28" y="30" width="8" height="10"/>
              <rect x="22" y="40" width="20" height="4"/>
              <rect x="20" y="44" width="24" height="6" rx="1"/>
            </g>
          </svg>

          <!-- Vuvuzela rediseñada: cuerpo curvo claramente acampanado, no
               tubo+triángulo. Asoma angulada desde el borde superior derecho. -->
          <svg class="wc-horn wc-horn--1" viewBox="0 0 260 90">
            <!-- Sombra interior de la campana (para dar profundidad) -->
            <ellipse cx="252" cy="45" rx="3" ry="40" fill="rgba(0,0,0,0.32)"/>
            <!-- Cuerpo principal de la vuvuzela: tubo delgado curvándose hacia campana acampanada -->
            <path d="
              M 18 40
              L 165 33
              C 185 30, 200 24, 215 14
              L 250 4
              C 256 12, 256 78, 250 86
              L 215 76
              C 200 66, 185 60, 165 57
              L 18 50
              Z
            " fill="url(#wcHorn)" stroke="#7a2e00" stroke-width="1.5"/>
            <!-- Brillo / highlight superior del tubo -->
            <path d="M 22 36 L 162 32 L 162 35 L 22 39 Z" fill="rgba(255,255,255,0.42)"/>
            <!-- Boquilla redonda al inicio -->
            <circle cx="14" cy="45" r="9" fill="#1a1a1a" stroke="#000" stroke-width="0.5"/>
            <circle cx="14" cy="45" r="4.5" fill="#3a3a3a"/>
          </svg>
        }
      </div>
    } @else {
      <!-- Modo corner: solo un balón pequeño -->
      <svg class="wc-corner" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="50" r="46" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>
        <polygon points="50,22 62,32 58,46 42,46 38,32" fill="#1a1a1a"/>
        <polygon points="22,52 33,46 42,55 38,68 26,66" fill="#1a1a1a"/>
        <polygon points="78,52 67,46 58,55 62,68 74,66" fill="#1a1a1a"/>
      </svg>
    }

    <!-- Canvas de confetti one-shot -->
    @if (confetti()) {
      <canvas #canvas class="wc-canvas" aria-hidden="true"></canvas>
    }
  `,
  styles: [`
    /* Host = capa decorativa overlay. NO debe ocupar espacio en el flujo
       del padre — si lo hace, empuja al resto del contenido y se superpone.
       El contenedor padre debe ser position: relative (hero/banner ya lo son). */
    :host {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 0;
      overflow: hidden;
    }

    /* En modo HERO, el host se EXTIENDE al ancho completo del viewport
       (100vw, centrado) — ignorando el max-width:1080px del .hero. Esto
       permite que los balones/trofeos/vuvuzelas asomen desde los bordes
       REALES de la pantalla con su mitad fuera del viewport. Sin esto,
       en pantallas anchas las decoraciones aparecen "cortadas por un
       div" porque el host está limitado al ancho del hero centrado.
       .landing tiene overflow-x:hidden → no genera scroll horizontal. */
    :host([data-mode='hero']) {
      left: 50%;
      right: auto;
      width: 100vw;
      transform: translateX(-50%);
    }

    .wc {
      position: absolute;
      inset: 0;
      overflow: hidden;
      color: var(--accent);
    }

    /* Defs SVG fuera de viewport (solo para los gradients reutilizables). */
    .wc-defs { position: absolute; width: 0; height: 0; }

    /* Balones — todos del lado derecho, distintos tamaños para variedad.
       Algunos entran parcialmente desde el borde para dar sensación de
       movimiento "hacia dentro de la página". */
    .wc-ball {
      position: absolute;
      filter: drop-shadow(0 10px 22px rgba(0,0,0,0.22));
      animation: wc-float 7s ease-in-out infinite;
      will-change: transform;
    }

    /* Balones GRANDES, asomando exactamente con la MITAD visible desde los
       bordes del hero. El host tiene overflow:hidden → el navegador clipea
       lo que esté fuera de inset:0. Posicionamos con offset negativo igual
       a la mitad del tamaño para que entren exactamente a la mitad. */

    /* Balón GRANDE asoma desde el borde SUPERIOR derecho. 240px de diámetro,
       offset top:-120px → exactamente la mitad superior queda fuera del hero. */
    .wc-ball--main {
      width: 240px; height: 240px;
      top: -120px; right: 6%;
      opacity: 0.85;
      animation-delay: 0s;
    }

    /* Balón mediano asoma desde el borde DERECHO. 160px, right:-80px →
       mitad derecha del balón fuera del hero. */
    .wc-ball--small {
      width: 160px; height: 160px;
      top: 42%; right: -80px;
      opacity: 0.75;
      animation: wc-float-rev 9s ease-in-out infinite;
    }

    /* Trofeo grande asoma desde el borde INFERIOR derecho. 180px, bottom:-90px. */
    .wc-trophy {
      position: absolute;
      width: 180px; height: 180px;
      bottom: -90px; right: 22%;
      filter: drop-shadow(0 12px 24px rgba(184,122,0,0.5));
      animation: wc-tilt 6s ease-in-out infinite;
      transform-origin: center top;
      opacity: 0.9;
    }

    /* Vuvuzela grande asoma desde el borde DERECHO, angulada hacia abajo-izq.
       Posicionada para que el cuerpo del tubo y la boquilla queden ocultos
       del lado derecho y solo se vea la campana entrando al hero. */
    .wc-horn {
      position: absolute;
      filter: drop-shadow(0 10px 20px rgba(180,83,9,0.5));
      will-change: transform;
    }
    .wc-horn--1 {
      --base-rot: 155deg;
      width: 260px; height: auto;
      top: 12%; right: -140px;
      transform: rotate(155deg);
      opacity: 0.85;
      animation: wc-horn-sway 5s ease-in-out infinite;
    }

    /* Banner mode: solo el balón principal, centrado vertical en el lado derecho.
       Usamos calc() en lugar de transform porque la animación wc-float ya usa
       transform y se las sobrescribiría. */
    .wc--banner .wc-ball--main {
      width: 72px; height: 72px;
      top: calc(50% - 36px);
      right: 5%;
      opacity: 0.65;
    }
    .wc--banner .wc-ball--small,
    .wc--banner .wc-trophy,
    .wc--banner .wc-horn { display: none; }

    /* Corner */
    .wc-corner {
      position: absolute;
      width: 44px; height: 44px;
      top: 12px; right: 12px;
      opacity: 0.6;
      filter: drop-shadow(0 4px 10px rgba(0,0,0,0.2));
      animation: wc-spin-slow 14s linear infinite;
    }

    /* Canvas confetti */
    .wc-canvas {
      position: fixed;
      inset: 0;
      width: 100vw; height: 100vh;
      pointer-events: none;
      z-index: 9999;
    }

    /* ===== Animaciones ===== */
    @keyframes wc-float {
      0%, 100% { transform: translateY(0) rotate(-8deg); }
      50%      { transform: translateY(-18px) rotate(8deg); }
    }
    @keyframes wc-float-rev {
      0%, 100% { transform: translateY(0) rotate(10deg); }
      50%      { transform: translateY(-14px) rotate(-12deg); }
    }
    @keyframes wc-tilt {
      0%, 100% { transform: rotate(-4deg) translateY(0); }
      50%      { transform: rotate(4deg)  translateY(-4px); }
    }
    @keyframes wc-spin {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }
    /* Las cornetas tienen un rotate base (ya sea -18deg o 15deg). Para el
       sway, mezclamos ese rotate base con un pequeño vaivén; cada instancia
       ajusta su propio offset definiendo --base-rot en línea. */
    @keyframes wc-horn-sway {
      0%, 100% { transform: rotate(var(--base-rot, -18deg)) translateY(0); }
      50%      { transform: rotate(calc(var(--base-rot, -18deg) + 3deg)) translateY(-6px); }
    }
    @keyframes wc-spin-slow {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .wc-ball, .wc-trophy, .wc-corner, .wc-horn { animation: none; }
    }

    /* En móvil ocultamos decoraciones grandes para no saturar pantallas chicas.
       En móvil .hero__art se oculta (display:none en landing) y el hero pasa
       a 1 columna → menos espacio para decoraciones grandes. */
    @media (max-width: 720px) {
      .wc-ball--small, .wc-horn--1 { display: none; }
      .wc-ball--main { width: 160px; height: 160px; top: -80px; right: -30px; }
      .wc-trophy { width: 120px; height: 120px; bottom: -60px; right: 6%; }
    }

    @media (max-width: 720px) {
      .wc-ball--main { width: 80px; height: 80px; top: 8%; right: 4%; }
      .wc-ball--small { width: 42px; height: 42px; }
      .wc-trophy { width: 52px; height: 52px; bottom: 6%; right: 6%; }
    }
  `],
})
export class WorldCup2026Component implements AfterViewInit, OnDestroy {
  /** Layout del componente (decoraciones). */
  readonly mode = input<'hero' | 'banner' | 'corner'>('hero');
  /** Si true, dispara confetti one-shot al montar. */
  readonly confetti = input<boolean>(false);
  /** Clave de sessionStorage para no repetir el confetti en la misma sesión. */
  readonly confettiKey = input<string>('wc2026.confetti');

  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  private readonly platformId = inject(PLATFORM_ID);
  private rafId: number | null = null;
  private particles: Particle[] = [];
  private startTs = 0;

  ngAfterViewInit(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (!this.confetti()) return;

    // Evita repetir en navegación SPA dentro de la misma sesión.
    try {
      if (sessionStorage.getItem(this.confettiKey()) === '1') return;
      sessionStorage.setItem(this.confettiKey(), '1');
    } catch { /* sessionStorage bloqueado: continúa igual */ }

    // Pequeño delay para que el hero termine su animación inicial.
    setTimeout(() => this.launchConfetti(), 350);
  }

  ngOnDestroy(): void {
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
  }

  private launchConfetti(): void {
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const w = canvas.width = Math.floor(window.innerWidth * dpr);
    const h = canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    ctx.scale(dpr, dpr);

    const colors = ['#22c55e', '#ef4444', '#f59e0b', '#3b82f6', '#fff', '#ffd95a'];
    // Lluvia continua desde TODO el ancho superior, no solo desde el centro
    // → efecto "lluvia de confetti" en lugar de "explosión central".
    const count = window.innerWidth < 600 ? 120 : 220;
    this.particles = Array.from({ length: count }, () => ({
      x: Math.random() * window.innerWidth,
      y: -20 - Math.random() * window.innerHeight * 0.5,
      vx: (Math.random() - 0.5) * 2.5,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      size: 6 + Math.random() * 8,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    }));

    // Duración total de la lluvia: 5 segundos. El fade arranca a los 3s
    // para que los primeros segundos se vea fuerte y se desvanece gradual.
    const TOTAL_DURATION = 5.0;
    const FADE_START = 3.0;

    this.startTs = performance.now();
    const tick = (now: number) => {
      const t = (now - this.startTs) / 1000;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

      // Alpha global: 1.0 durante los primeros 3s, luego fade lineal a 0
      // entre 3s y 5s → desaparece degradado.
      const alpha = t < FADE_START
        ? 1
        : Math.max(0, 1 - (t - FADE_START) / (TOTAL_DURATION - FADE_START));

      for (const p of this.particles) {
        p.vy += 0.08; // gravedad
        p.vx *= 0.995; // arrastre horizontal
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.globalAlpha = alpha;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (t < TOTAL_DURATION) {
        this.rafId = requestAnimationFrame(tick);
      } else {
        // limpiar canvas al terminar
        ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        const canvasEl = this.canvasRef?.nativeElement;
        if (canvasEl) canvasEl.style.display = 'none';
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }
}

interface Particle {
  x: number; y: number;
  vx: number; vy: number;
  rot: number; vr: number;
  size: number;
  color: string;
  shape: 'rect' | 'circle';
}
