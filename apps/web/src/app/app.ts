import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';
import { ThemeService } from './core/theme';

@Component({
  selector: 'dn-root',
  imports: [RouterOutlet, LookProvider],
  // Every Trench Coat element inside takes the clean look.
  template: `<tc-look-provider look="clean"><router-outlet /></tc-look-provider>`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {
  // Created here so the theme applies on every page, signed in or not.
  protected readonly theme = inject(ThemeService);
}
