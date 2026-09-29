import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  let systemChange: (() => void) | undefined;
  let darkSystem: boolean;
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    localStorage.removeItem('market-tec-theme');
    darkSystem = true;
    systemChange = undefined;
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: () => ({
      get matches() { return darkSystem; },
      addEventListener: (_: string, listener: () => void) => { systemChange = listener; },
      removeEventListener: () => {},
    }) });
    TestBed.configureTestingModule({});
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.removeItem('market-tec-theme');
    document.documentElement.removeAttribute('data-theme');
    Object.defineProperty(window, 'matchMedia', { configurable: true, value: originalMatchMedia });
  });

  it('follows the system until a theme is explicitly selected', () => {
    const service = TestBed.inject(ThemeService);
    expect(service.theme()).toBe('dark');
    darkSystem = false;
    systemChange?.();
    expect(service.theme()).toBe('light');
    service.toggle();
    systemChange?.();
    expect(service.theme()).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(localStorage.getItem('market-tec-theme')).toBe('dark');
  });

  it('restores a saved preference over the system preference', () => {
    localStorage.setItem('market-tec-theme', 'light');
    expect(TestBed.inject(ThemeService).theme()).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('ignores invalid stored preferences', () => {
    localStorage.setItem('market-tec-theme', 'invalid');
    expect(TestBed.inject(ThemeService).theme()).toBe('dark');
  });
});
