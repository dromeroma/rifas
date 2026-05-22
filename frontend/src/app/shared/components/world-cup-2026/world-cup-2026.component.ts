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
        <!-- Líneas de cancha (solo hero) -->
        @if (mode() === 'hero') {
          <svg class="wc-field" viewBox="0 0 800 400" preserveAspectRatio="none">
            <defs>
              <linearGradient id="wcFieldFade" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="currentColor" stop-opacity="0"/>
                <stop offset="50%" stop-color="currentColor" stop-opacity="0.35"/>
                <stop offset="100%" stop-color="currentColor" stop-opacity="0"/>
              </linearGradient>
            </defs>
            <g stroke="url(#wcFieldFade)" stroke-width="1.2" fill="none">
              <line x1="400" y1="0" x2="400" y2="400" />
              <circle cx="400" cy="200" r="70" />
              <rect x="0" y="120" width="60" height="160" />
              <rect x="740" y="120" width="60" height="160" />
            </g>
          </svg>
        }

        <!-- Balón principal -->
        <svg class="wc-ball wc-ball--main" viewBox="0 0 100 100">
          <defs>
            <radialGradient id="wcBallShade" cx="35%" cy="30%" r="70%">
              <stop offset="0%" stop-color="#fff" stop-opacity="1"/>
              <stop offset="80%" stop-color="#f3f3f3" stop-opacity="1"/>
              <stop offset="100%" stop-color="#c8c8c8" stop-opacity="1"/>
            </radialGradient>
          </defs>
          <circle cx="50" cy="50" r="46" fill="url(#wcBallShade)" stroke="#1a1a1a" stroke-width="1.5"/>
          <!-- Pentágonos clásicos -->
          <polygon points="50,22 62,32 58,46 42,46 38,32"
                   fill="#1a1a1a"/>
          <polygon points="22,52 33,46 42,55 38,68 26,66"
                   fill="#1a1a1a"/>
          <polygon points="78,52 67,46 58,55 62,68 74,66"
                   fill="#1a1a1a"/>
          <!-- Conectores -->
          <line x1="50" y1="46" x2="50" y2="55" stroke="#1a1a1a" stroke-width="1.5"/>
          <line x1="42" y1="46" x2="33" y2="46" stroke="#1a1a1a" stroke-width="1.5"/>
          <line x1="58" y1="46" x2="67" y2="46" stroke="#1a1a1a" stroke-width="1.5"/>
        </svg>

        @if (mode() === 'hero') {
          <!-- Balón secundario pequeño -->
          <svg class="wc-ball wc-ball--small" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="46" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>
            <polygon points="50,22 62,32 58,46 42,46 38,32" fill="#1a1a1a"/>
          </svg>

          <!-- Trofeo -->
          <svg class="wc-trophy" viewBox="0 0 64 64">
            <defs>
              <linearGradient id="wcGold" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#ffd95a"/>
                <stop offset="50%" stop-color="#f0b400"/>
                <stop offset="100%" stop-color="#b87a00"/>
              </linearGradient>
            </defs>
            <g fill="url(#wcGold)" stroke="#7a4f00" stroke-width="0.8">
              <path d="M22 8h20v4c0 8-3 14-10 16-7-2-10-8-10-16V8z"/>
              <path d="M14 12h8v4c0 4 2 7 5 8-4 1-9-1-11-5-1-2-2-4-2-7z"/>
              <path d="M50 12h-8v4c0 4-2 7-5 8 4 1 9-1 11-5 1-2 2-4 2-7z"/>
              <rect x="28" y="30" width="8" height="10"/>
              <rect x="22" y="40" width="20" height="4"/>
              <rect x="20" y="44" width="24" height="6" rx="1"/>
            </g>
          </svg>

          <!-- Confetti decorativos estáticos (rombos pequeños) -->
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

    /* Líneas de cancha */
    .wc-field {
      position: absolute;
      inset: auto 0 0 0;
      width: 100%; height: 50%;
      opacity: 0.3;
      mix-blend-mode: soft-light;
    }

    /* Balón principal — flotando. Movido a esquina superior izquierda para
       no competir con el ticket art (que está en la columna derecha). */
    .wc-ball {
      position: absolute;
      filter: drop-shadow(0 12px 24px rgba(0,0,0,0.18));
      animation: wc-float 7s ease-in-out infinite;
      will-change: transform;
      opacity: 0.55;
    }
    .wc-ball--main {
      width: 84px; height: 84px;
      top: 4%; right: 38%;
      animation-delay: 0s;
    }
    .wc-ball--small {
      width: 44px; height: 44px;
      bottom: 12%; left: 6%;
      animation: wc-float-rev 9s ease-in-out infinite;
      opacity: 0.45;
    }

    /* Trofeo — movido al borde inferior izquierdo para que no choque con el ticket. */
    .wc-trophy {
      position: absolute;
      width: 54px; height: 54px;
      bottom: 6%; left: 32%;
      filter: drop-shadow(0 6px 14px rgba(184,122,0,0.3));
      animation: wc-tilt 6s ease-in-out infinite;
      transform-origin: center bottom;
      opacity: 0.7;
    }

    /* Confetti estático decorativo */
    .wc-confetti-static {
      position: absolute;
      width: 10px; height: 10px;
      animation: wc-spin 5s linear infinite;
      opacity: 0.6;
    }
    .wc-confetti-static--1 { top: 16%; left: 12%; animation-duration: 5s; }
    .wc-confetti-static--2 { top: 70%; left: 22%; animation-duration: 6s; animation-direction: reverse; }
    .wc-confetti-static--3 { top: 78%; right: 18%; animation-duration: 4.5s; }
    .wc-confetti-static--4 { bottom: 28%; left: 48%; animation-duration: 7s; animation-direction: reverse; }

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
    .wc--banner .wc-confetti-static,
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
    @keyframes wc-spin-slow {
      from { transform: rotate(0deg); }
      to   { transform: rotate(360deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .wc-ball, .wc-trophy, .wc-confetti-static, .wc-corner { animation: none; }
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
