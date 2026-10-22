import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'cy-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page empty" style="padding-top: 96px">
      <i aria-hidden="true" class="ph ph-footprints" style="font-size: 48px"></i>
      <h1 style="font-size: 28px; margin-bottom: 8px">No footprints here</h1>
      <p>This page doesn't exist, or it's private.</p>
      <a class="btn" routerLink="/">Go home</a>
    </div>
  `,
})
export class NotFoundPage {}
