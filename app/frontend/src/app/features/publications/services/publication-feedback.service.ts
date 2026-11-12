import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class PublicationFeedbackService {
  private readonly feedback = signal<'created' | 'updated' | null>(null);
  private dismissTimer: ReturnType<typeof setTimeout> | null = null;

  readonly saved = this.feedback.asReadonly();

  notifyCreated(): void {
    this.show('created');
  }

  notifyUpdated(): void {
    this.show('updated');
  }

  private show(kind: 'created' | 'updated'): void {
    this.feedback.set(kind);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
    }

    this.dismissTimer = setTimeout(
      () => this.dismiss(),
      6000
    );
  }

  dismiss(): void {
    this.feedback.set(null);

    if (this.dismissTimer) {
      clearTimeout(this.dismissTimer);
      this.dismissTimer = null;
    }
  }
}
