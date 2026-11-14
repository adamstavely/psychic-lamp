import { effect, inject, Injectable } from '@angular/core';
import type { Preferences } from '@donovan/contracts';
import { Session } from './session';

/** Shared with the inline script in index.html, which applies the last theme before the app boots (no flash). */
export const THEME_STORAGE_KEY = 'donovan.theme';

/** Applies the person's theme through Trench Coat's `data-tc-theme` on <html>; "system" follows the OS. */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly #session = inject(Session);

  readonly theme = () => this.#session.preferences().theme;

  constructor() {
    effect(() => apply(this.theme()));
  }

  /** The theme showing right now, resolving "system" against the OS. */
  resolved(): 'light' | 'dark' {
    const theme = this.theme();
    if (theme !== 'system') return theme;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  toggle(): Promise<void> {
    return this.#session.updatePreferences({ theme: this.resolved() === 'dark' ? 'light' : 'dark' });
  }
}

function apply(theme: Preferences['theme']): void {
  document.documentElement.dataset['tcTheme'] = theme;
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies once preferences load.
  }
}
