import { Directive, effect, ElementRef, inject, input } from '@angular/core';
import { icon, type IconName } from './icons';

/** Fills its element with a decorative icon: `<span slot="icon" dnIcon="plus"></span>`. */
@Directive({ selector: '[dnIcon]' })
export class IconDirective {
  readonly dnIcon = input.required<IconName>();
  readonly iconSize = input(16);
  readonly #host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    effect(() => this.#host.replaceChildren(icon(this.dnIcon(), this.iconSize())));
  }
}
