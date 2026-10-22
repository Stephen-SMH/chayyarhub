import { provideHttpClient, withFetch } from '@angular/common/http';
import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { PreloadAllModules, provideRouter, withComponentInputBinding, withInMemoryScrolling, withPreloading } from '@angular/router';
import { routes } from './app.routes';
import { Session } from './core/session';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // Route params, data and query params arrive as component inputs.
    provideRouter(
      routes,
      withComponentInputBinding(),
      withInMemoryScrolling({ scrollPositionRestoration: 'top' }),
      withPreloading(PreloadAllModules),
    ),
    provideHttpClient(withFetch()),
    // Know who is signed in before the first page renders.
    provideAppInitializer(() => inject(Session).load()),
  ],
};
