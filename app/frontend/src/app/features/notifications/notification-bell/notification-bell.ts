import { Component, computed, DestroyRef, ElementRef, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification } from '../models/notification.model';
import { NotificationService } from '../services/notification.service';

/** Texto relativo en español para un Epoch en segundos («hace 5 min», «hace 2 h», «12 nov»). */
export function relativeTime(epochSeconds: number, now = Date.now()): string {
  const seconds = Math.max(0, Math.floor(now / 1000) - epochSeconds);
  if (seconds < 60) return 'Hace un momento';
  if (seconds < 3600) return `Hace ${Math.floor(seconds / 60)} min`;
  if (seconds < 86_400) return `Hace ${Math.floor(seconds / 3600)} h`;
  if (seconds < 7 * 86_400) {
    const days = Math.floor(seconds / 86_400);
    return days === 1 ? 'Ayer' : `Hace ${days} días`;
  }
  return new Date(epochSeconds * 1000).toLocaleDateString('es-CR', { day: 'numeric', month: 'short' });
}

/** Campana del header: contador de no leídas y panel con las últimas notificaciones de mensajes. */
@Component({
  selector: 'app-notification-bell',
  templateUrl: './notification-bell.html',
  styleUrl: './notification-bell.scss',
})
export class NotificationBell {
  protected readonly notifications = inject(NotificationService);
  private readonly router = inject(Router);
  private readonly host = inject(ElementRef<HTMLElement>);

  protected readonly open = signal(false);
  protected readonly badge = computed(() => {
    const count = this.notifications.unreadCount();
    return count > 9 ? '9+' : count > 0 ? String(count) : null;
  });
  protected readonly label = computed(() => {
    const count = this.notifications.unreadCount();
    return count === 0
      ? 'Notificaciones'
      : `Notificaciones, ${count} sin leer`;
  });
  protected readonly relativeTime = relativeTime;

  constructor() {
    this.notifications.startPolling(inject(DestroyRef));
  }

  protected toggle(): void {
    this.open.update((open) => !open);
    if (this.open()) this.notifications.refresh();
  }

  protected openNotification(notification: AppNotification): void {
    this.notifications.markAsRead(notification);
    this.open.set(false);
    void this.router.navigate(['/mensajes'], { queryParams: { chat: notification.chatId } });
  }

  @HostListener('document:click', ['$event'])
  protected closeOnOutsideClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) {
      this.open.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  protected closeOnEscape(): void {
    this.open.set(false);
  }
}
