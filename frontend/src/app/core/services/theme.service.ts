import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

export type Theme = 'dark' | 'light';

const STORAGE_KEY = 'rifas.theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly doc = inject(DOCUMENT);
  private readonly _theme = signal<Theme>(this.initial());

  readonly theme = this._theme.asReadonly();
  readonly isDark = computed(() => this._theme() === 'dark');

  constructor() {
    this.apply(this._theme());
  }

  toggle(): void {
    this.set(this._theme() === 'dark' ? 'light' : 'dark');
  }

  set(t: Theme): void {
    this._theme.set(t);
    this.apply(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  }

  private apply(t: Theme): void {
    this.doc.documentElement.setAttribute('data-theme', t);
  }

  private initial(): Theme {
    try {
      const saved = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (saved === 'dark' || saved === 'light') return saved;
    } catch {}
    return this.doc.defaultView?.matchMedia?.('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  }
}
