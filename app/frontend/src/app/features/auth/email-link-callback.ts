import { Component, OnInit, inject, signal } from '@angular/core';
import { Location } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthSessionService } from '../../core/auth/v2/auth-session.service';
import type { EmailLinkProof } from '../../core/auth/v2/auth-contract';
import { FEATURE_FLAGS } from '../../core/feature-flags';
import { describeEmailLinkFailure } from './services/email-link-errors';

const HEX_32 = /^[0-9a-f]{32}$/;
const HEX_64 = /^[0-9a-f]{64}$/;

/** `#attempt=<32 hex>&token=<64 hex>` → prueba del enlace, o null si el fragmento no es exactamente eso. */
export function parseEmailLinkFragment(fragment: string | null | undefined): EmailLinkProof | null {
  if (!fragment) return null;
  const params = new URLSearchParams(fragment.startsWith('#') ? fragment.slice(1) : fragment);
  const attemptId = params.get('attempt');
  const token = params.get('token');
  if ([...params.keys()].length !== 2 || !attemptId || !token || !HEX_32.test(attemptId) || !HEX_64.test(token)) {
    return null;
  }
  return { attemptId, token };
}

/**
 * Destino del Magic Link (`/acceso/correo#attempt=…&token=…`). El fragmento nunca llega a un servidor; se lee una
 * vez, se borra de la barra del navegador antes de cualquier petición y se confirma con un POST explícito. El
 * `attemptId` y el `token` solo viven en memoria durante esa confirmación.
 */
@Component({
  selector: 'app-email-link-callback',
  standalone: true,
  template: `
    <main class="login">
      <section class="login-card" aria-live="polite">
        <header class="login-brand">
          <div class="login-brand__welcome">
            <h1>Acceso con correo institucional</h1>
          </div>
        </header>
        @if (failure(); as message) {
          <div class="login-feedback" role="alert">
            <span>!</span>
            <p>{{ message }}</p>
          </div>
          <button type="button" class="login-submit" (click)="requestAnotherLink()">
            Solicitar otro enlace
          </button>
        } @else {
          <p class="google-login-note" role="status">Verificando tu enlace de acceso...</p>
        }
      </section>
    </main>
  `,
  styleUrl: './login.scss',
})
export class EmailLinkCallback implements OnInit {
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly session = inject(FEATURE_FLAGS).authCoreV2 ? inject(AuthSessionService) : null;
  private readonly proof: EmailLinkProof | null;

  readonly failure = signal<string | null>(null);

  constructor() {
    const route = inject(ActivatedRoute);
    this.proof = parseEmailLinkFragment(route.snapshot.fragment ?? globalThis.location?.hash);
    // El secreto sale de la barra del navegador (y del historial) antes de cualquier otra cosa.
    this.location.replaceState(this.location.path(false));
  }

  async ngOnInit(): Promise<void> {
    if (!this.session) {
      this.failure.set('El acceso con correo institucional no está disponible en este momento.');
      return;
    }
    if (!this.proof) {
      this.failure.set('El enlace no es válido o está incompleto. Solicita uno nuevo para ingresar.');
      return;
    }

    try {
      await this.session.confirmEmailLink(this.proof);
    } catch (error) {
      this.failure.set(describeEmailLinkFailure(error));
      return;
    }

    if (!await this.router.navigate(['/'], { replaceUrl: true, state: { openProfile: true } })) {
      this.failure.set('Ingresaste, pero no fue posible abrir MarketTec. Recarga la página.');
    }
  }

  requestAnotherLink(): void {
    void this.router.navigate(['/login']);
  }
}
