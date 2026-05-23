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

        <!-- Balón principal — entra desde el borde derecho, parcialmente fuera -->
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
          <!-- Balón secundario pequeño en medio-derecha -->
          <svg class="wc-ball wc-ball--small" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="url(#wcBallShade)" stroke="#1a1a1a" stroke-width="1.5"/>
            <polygon points="50,22 62,32 58,46 42,46 38,32" fill="#1a1a1a"/>
            <polygon points="22,52 33,46 42,55 38,68 26,66" fill="#1a1a1a"/>
            <polygon points="78,52 67,46 58,55 62,68 74,66" fill="#1a1a1a"/>
          </svg>

          <!-- Balón mini que entra desde el borde derecho -->
          <svg class="wc-ball wc-ball--mini" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="#fff" stroke="#1a1a1a" stroke-width="2"/>
            <polygon points="50,22 62,32 58,46 42,46 38,32" fill="#1a1a1a"/>
          </svg>

          <!-- Trofeo en esquina inferior derecha -->
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

          <!-- Corneta / vuvuzela entrando angulada desde el borde superior derecho -->
          <svg class="wc-horn wc-horn--1" viewBox="0 0 220 70">
            <!-- Tubo -->
            <rect x="10" y="28" width="130" height="14" rx="3"
                  fill="url(#wcHorn)" stroke="#5a2e00" stroke-width="1"/>
            <!-- Campana (bell) -->
            <polygon points="140,18 215,2 215,68 140,52"
                     fill="url(#wcHorn)" stroke="#5a2e00" stroke-width="1"/>
            <!-- Boquilla -->
            <circle cx="8" cy="35" r="6" fill="#1a1a1a"/>
            <!-- Highlight -->
            <rect x="12" y="30" width="125" height="3" fill="rgba(255,255,255,0.35)"/>
          </svg>

          <!-- Corneta más pequeña entrando angulada desde abajo derecho -->
          <svg class="wc-horn wc-horn--2" viewBox="0 0 220 70">
            <rect x="10" y="28" width="130" height="14" rx="3"
                  fill="url(#wcHorn)" stroke="#5a2e00" stroke-width="1"/>
            <polygon points="140,18 215,2 215,68 140,52"
                     fill="url(#wcHorn)" stroke="#5a2e00" stroke-width="1"/>
            <circle cx="8" cy="35" r="6" fill="#1a1a1a"/>
            <rect x="12" y="30" width="125" height="3" fill="rgba(255,255,255,0.35)"/>
          </svg>

          <!-- Confetti decorativos estáticos, solo en lado derecho -->
          <svg class="wc-confetti-static wc-confetti-static--1" viewBox="0 0 10 10">
            <polygon points="5,0 10,5 5,10 0,5" fill="#22c55e"/>
          </svg>
          <svg class="wc-confetti-static wc-confetti-static--2" viewBox="0 0 10 10">
            <polygon points="5,0 10,5 5,10 0,5" fill="#ef4444"/>
          </svg>
          <svg class="wc-confetti-static wc-confetti-static--3" viewBox="0 0 10 10">
            <polygon points="5,0 10,5 5,10 0,5" fill="#f59e0b"/>
          </svg>
          <svg class="wc-confetti-static wc-confetti-static--4" viewBox="0 0 10 10">
            <polygon points="5,0 10,5 5,10 0,5" fill="#3b82f6"/>
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

    /* Balón GRANDE — entra parcialmente desde el borde derecho, esquina
       superior. Mitad de él queda fuera del viewport. */
    .wc-ball--main {
      width: 140px; height: 140px;
      top: 6%; right: -50px;
      opacity: 0.7;
      animation-delay: 0s;
    }

    /* Balón mediano flotando libre en el centro-derecho. */
    .wc-ball--small {
      width: 72px; height: 72px;
      top: 50%; right: 18%;
      opacity: 0.55;
      animation: wc-float-rev 9s ease-in-out infinite;
    }

    /* Balón mini entrando desde el borde derecho, parte inferior. */
    .wc-ball--mini {
      width: 50px; height: 50px;
      bottom: 28%; right: -18px;
      opacity: 0.5;
      animation: wc-float 11s ease-in-out infinite;
      animation-delay: 1.5s;
    }

    /* Trofeo — esquina inferior derecha. */
    .wc-trophy {
      position: absolute;
      width: 64px; height: 64px;
      bottom: 8%; right: 38%;
      filter: drop-shadow(0 8px 18px rgba(184,122,0,0.4));
      animation: wc-tilt 6s ease-in-out infinite;
      transform-origin: center bottom;
      opacity: 0.8;
    }

    /* Cornetas (vuvuzelas) — entran anguladas desde el borde derecho. */
    .wc-horn {
      position: absolute;
      filter: drop-shadow(0 8px 16px rgba(180,83,9,0.4));
      will-change: transform;
    }
    /* Corneta grande, esquina superior derecha apuntando hacia adentro. */
    .wc-horn--1 {
      --base-rot: -18deg;
      width: 180px; height: auto;
      top: 22%; right: -40px;
      transform: rotate(-18deg);
      opacity: 0.7;
      animation: wc-horn-sway 5s ease-in-out infinite;
    }
    /* Corneta más pequeña, parte inferior derecha. */
    .wc-horn--2 {
      --base-rot: 15deg;
      width: 130px; height: auto;
      bottom: 12%; right: 8%;
      transform: rotate(15deg);
      opacity: 0.55;
      animation: wc-horn-sway 7s ease-in-out infinite;
      animation-delay: 1s;
    }

    /* Confetti estático decorativo — todos en mitad derecha. */
    .wc-confetti-static {
      position: absolute;
      width: 11px; height: 11px;
      animation: wc-spin 5s linear infinite;
      opacity: 0.65;
    }
    .wc-confetti-static--1 { top: 14%; right: 22%; animation-duration: 5s; }
    .wc-confetti-static--2 { top: 38%; right: 6%; animation-duration: 6s; animation-direction: reverse; }
    .wc-confetti-static--3 { top: 62%; right: 32%; animation-duration: 4.5s; }
    .wc-confetti-static--4 { bottom: 18%; right: 24%; animation-duration: 7s; animation-direction: reverse; }

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
    .wc--banner .wc-ball--mini,
    .wc--banner .wc-trophy,
    .wc--banner .wc-confetti-static,
    .wc--banner .wc-horn,
    .wc--banner .wc-field { display: none; }

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
      .wc-ball, .wc-trophy, .wc-confetti-static, .wc-corner, .wc-horn { animation: none; }
    }

    /* En móvil, ocultar algunas decoraciones para no saturar pantallas chicas. */
    @media (max-width: 720px) {
      .wc-ball--small, .wc-ball--mini, .wc-horn--2,
      .wc-confetti-static--3, .wc-confetti-static--4 { display: none; }
      .wc-ball--main { width: 100px; height: 100px; top: 4%; right: -36px; }
      .wc-horn--1 { width: 130px; top: 18%; right: -30px; }
      .wc-trophy { width: 52px; height: 52px; right: 18%; }
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
    const count = window.innerWidth < 600 ? 80 : 140;
    const cx = window.innerWidth / 2;
    this.particles = Array.from({ length: count }, () => ({
      x: cx + (Math.random() - 0.5) * 160,
      y: -20 - Math.random() * 60,
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.2,
      size: 6 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      shape: Math.random() < 0.5 ? 'rect' : 'circle',
    }));

    this.startTs = performance.now();
    const tick = (now: number) => {
      const t = (now - this.startTs) / 1000;
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

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
        ctx.globalAlpha = Math.max(0, 1 - t / 3.5);
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      if (t < 3.5) {
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
