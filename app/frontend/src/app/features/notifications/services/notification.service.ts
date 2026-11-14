import { computed, DestroyRef, inject, Injectable, signal } from '@angular/core';
import { DOCUMENT } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { catchError, EMPTY, exhaustMap, filter, fromEvent, merge, of, Subscription, tap, timer } from 'rxjs';
import { notificationsApiBase } from '../../../core/api/notifications-api';
import { FEATURE_FLAGS } from '../../../core/feature-flags';
import { AppNotification, NotificationPage } from '../models/notification.model';

/** Intervalo de consulta: el stream SSE no atraviesa el proxy de Static Web Apps (límite de 45 s). */
export const NOTIFICATIONS_POLL_MS = 30_000;
const PAGE_SIZE = 20;

/**
 * Historial de notificaciones del usuario (ms-notifications). Solo está activo con el ms-catalog propio
 * (`authCoreV2` + `catalogInternalJwt`), que es el que publica los eventos `message.sent`; el JWT interno lo adjunta
 * el interceptor (`isNotificationsOperation`). Consulta las últimas notificaciones periódicamente mientras la pestaña
 * está visible y al volver a ella.
 */
@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly document = inject(DOCUMENT);
  private readonly flags = inject(FEATURE_FLAGS);
  private readonly base =
    this.flags.authCoreV2 && this.flags.catalogInternalJwt === true ? notificationsApiBase() : null;

  readonly enabled = this.base !== null;
  readonly items = signal<readonly AppNotification[]>([]);
  readonly unreadCount = computed(() => this.items().filter((item) => !item.isRead).length);
  readonly loaded = signal(false);
  readonly error = signal(false);

  private polling: Subscription | null = null;

  /** Inicia la consulta periódica hasta que se destruya `destroyRef` (el header de la sesión). */
  startPolling(destroyRef: DestroyRef): void {
    if (!this.enabled || this.polling) return;

    const visible = () => this.document.visibilityState !== 'hidden';
    this.polling = merge(
      timer(0, NOTIFICATIONS_POLL_MS),
      fromEvent(this.document, 'visibilitychange'),
    )
      .pipe(
        filter(visible),
        exhaustMap(() => this.fetch()),
      )
      .subscribe();

    destroyRef.onDestroy(() => this.stopPolling());
  }

  stopPolling(): void {
    this.polling?.unsubscribe();
    this.polling = null;
    this.items.set([]);
    this.loaded.set(false);
    this.error.set(false);
  }

  /** Consulta inmediata (p. ej. al abrir el panel o al reintentar). */
  refresh(): void {
    this.fetch().subscribe();
  }

  markAsRead(notification: AppNotification): void {
    if (!this.base || notification.isRead) return;

    this.setRead([notification.notificationId], true);
    this.http
      .patch<AppNotification>(`${this.base}/notifications/${notification.notificationId}/read`, null)
      .subscribe({ error: () => this.setRead([notification.notificationId], false) });
  }

  markAllAsRead(): void {
    for (const notification of this.items()) {
      this.markAsRead(notification);
    }
  }

  private fetch() {
    if (!this.base) return EMPTY;

    const params = new HttpParams().set('pageSize', PAGE_SIZE);
    return this.http.get<NotificationPage>(`${this.base}/notifications`, { params }).pipe(
      tap((page) => {
        this.items.set(page.items);
        this.loaded.set(true);
        this.error.set(false);
      }),
      catchError(() => {
        this.error.set(true);
        return of(null);
      }),
    );
  }

  private setRead(ids: readonly string[], isRead: boolean): void {
    const target = new Set(ids);
    this.items.update((items) =>
      items.map((item) => (target.has(item.notificationId) ? { ...item, isRead } : item)),
    );
  }
}
