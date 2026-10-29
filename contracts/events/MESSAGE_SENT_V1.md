# Evento `message.sent` v1

**Estado:** Borrador pendiente de aprobación
**Productor:** `ms-catalog`
**Consumidor inicial:** `ms-notifications`

## Propósito

Comunicar que un mensaje ya fue aceptado y persistido por `ms-catalog`, de forma
que `ms-notifications` pueda crear una notificación sin consultar la base de datos
de catálogo ni la de usuarios.

## Payload mínimo

| Campo | Motivo |
|---|---|
| `chatId` | Trazabilidad y navegación futura hacia la conversación |
| `messageId` | Referencia inequívoca al mensaje persistido |
| `senderUserId` | Auditoría y reglas de notificación |
| `recipientUserId` | Enrutamiento sin consultar otro servicio |
| `sentAt` | Orden temporal en Epoch seconds |
| `publicationId` | Contexto del chat y posible navegación |
| `messagePreview` | Opcional, máximo 160 caracteres; puede omitirse por privacidad |

No se incluyen correo, teléfono, carrera, foto, token ni historial completo. El
productor determina el destinatario a partir de participantes autorizados del chat;
no copia `recipientUserId` de un body enviado por el cliente.

## Reglas

1. `eventId` es UUID e identifica de forma idempotente la entrega lógica.
2. `schemaVersion` debe ser `1` y `eventType` debe ser `message.sent`.
3. `senderUserId` y `recipientUserId` son distintos.
4. `occurredAt` y `sentAt` son enteros Epoch en segundos; no milisegundos.
5. `correlationId` conserva la correlación de la operación que originó el mensaje.
6. El consumidor valida antes de persistir y registra `eventId` procesados.
7. Un duplicado válido produce el mismo resultado y no una segunda notificación.
8. Un evento de tipo desconocido se ignora de forma observable o se enruta a
   cuarentena; no se interpreta como otro tipo.
9. Una versión mayor desconocida no se procesa con el esquema v1. Debe conservarse
   para diagnóstico/replay según la política de cola que se apruebe.
10. Agregar campos opcionales es compatible. Renombrar, retirar, cambiar tipos o
    significado requiere una nueva `schemaVersion` y un nuevo esquema.

Azure Queue, reintentos y DLQ no forman parte de este contrato y no están
implementados en esta tarea.
