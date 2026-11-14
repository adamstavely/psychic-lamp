import { bootstrapApplication } from '@angular/platform-browser';
import { App } from './app/app';
import { appConfig } from './app/app.config';
import { loadRuntimeConfig } from './app/core/runtime-config';

loadRuntimeConfig()
  .then((runtime) => bootstrapApplication(App, appConfig(runtime)))
  .catch((err: unknown) => {
    console.error(err);
    document.body.textContent =
      'Donovan could not start. Reload the page, and if it keeps happening, tell your administrator.';
  });
