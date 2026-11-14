import { Injectable, inject } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { type RouterStateSnapshot, TitleStrategy } from '@angular/router';

/** Every page title ends with the product's name, so tabs and screen readers say where you are first. */
@Injectable()
export class DonovanTitleStrategy extends TitleStrategy {
  readonly #title = inject(Title);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const page = this.buildTitle(snapshot);
    this.#title.setTitle(page ? `${page} · Donovan` : 'Donovan');
  }
}
