import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PublicationFeedbackService {
  private readonly created = signal(false);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  readonly creationVisible = this.created.asReadonly();

  notifyCreated(): void {
    this.created.set(true);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }

    this.dismissTimer = setTimeout(
      () => this.dismiss(),
      6000
    );
  }

  dismiss(): void {
    this.created.set(false);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
