import { DOCUMENT } from '@angular/common';
import { DestroyRef, Injectable, inject, signal } from '@angular/core';

type Theme = 'light' | 'dark';
const STORAGE_KEY = 'market-tec-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);
  private readonly window = this.document.defaultView;
  private readonly current = signal<Theme>('light');
  readonly theme = this.current.asReadonly();
  private preference: Theme | null = null;
  private readonly media = this.window?.matchMedia?.('(prefers-color-scheme: dark)');

  constructor() {
    try {
      const saved = this.window?.localStorage.getItem(STORAGE_KEY);
      if (saved === 'light' || saved === 'dark') this.preference = saved;
    } catch { /* Storage may be unavailable in private browsing. */ }
    this.apply(this.preference ?? (this.media?.matches ? 'dark' : 'light'));
    const onSystemChange = () => {
      if (!this.preference) this.apply(this.media?.matches ? 'dark' : 'light');
    };
    this.media?.addEventListener('change', onSystemChange);
    inject(DestroyRef).onDestroy(() => this.media?.removeEventListener('change', onSystemChange));
  }

  toggle(): void {
    this.preference = this.current() === 'dark' ? 'light' : 'dark';
    this.apply(this.preference);
    try {
      this.window?.localStorage.setItem(STORAGE_KEY, this.preference);
    } catch { /* The selected theme still works without persistence. */ }
  }

  private apply(theme: Theme): void {
    this.current.set(theme);
    this.document.documentElement.dataset['theme'] = theme;
  }
}
