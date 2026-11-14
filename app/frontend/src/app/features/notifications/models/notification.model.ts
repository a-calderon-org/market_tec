/** Notificación de mensaje recibido tal como la entrega ms-notifications (`GET /v1/notifications`, MTEC-25). */
export interface AppNotification {
  readonly notificationId: string;
  readonly eventId: string;
  readonly senderUserId: string;
  readonly chatId: string;
  readonly messageId: string;
  /** Epoch en segundos del envío del mensaje. */
  readonly occurredAt: number;
  readonly correlationId: string;
  /** Epoch en segundos de la creación de la notificación. */
  readonly createdAt: number;
  readonly isRead: boolean;
}

export interface NotificationPage {
  readonly items: readonly AppNotification[];
  readonly nextCursor: string | null;
}
