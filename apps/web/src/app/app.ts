import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { LookProvider } from '@adamstavely/trenchcoat/angular/look-provider';

@Component({
  selector: 'dn-root',
  imports: [RouterOutlet, LookProvider],
  templateUrl: './app.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class App {}
