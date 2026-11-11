import { validateContent, validateText } from '../../../domain/publication.js';
import type { Publication } from '../../../domain/publication.js';
import { messageText, messageTime } from '../../../domain/messaging.js';
import type { Chat, Message, MessageSent } from '../../../domain/messaging.js';
import { CosmosPersistenceError } from './store.js';
import type { StoredDocument } from './store.js';

export function physicalId(kind: string, logicalId: string): string {
  return kind + ':' + Buffer.from(logicalId, 'utf16le').toString('base64url');
}

function sortId(id: string): string {
  let key = '';
  for (let index = 0; index < id.length; index++) key += id.charCodeAt(index).toString(16).padStart(4, '0');
  return key;
}

function envelope(kind: string, logicalId: string, pk: string): StoredDocument {
  return { id: physicalId(kind, logicalId), pk, kind, schemaVersion: 1 };
}

function corrupt(): never {
  throw new CosmosPersistenceError('read');
}

export function fields(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) corrupt();
  return value as Record<string, unknown>;
}

export function document(value: unknown, kind: string, pk: string): Record<string, unknown> {
  const data = fields(value);
  if (data.kind !== kind || data.pk !== pk || data.schemaVersion !== 1) corrupt();
  return data;
}

function logicalId(data: Record<string, unknown>, kind: string, property = 'logicalId'): string {
  const id = data[property];
  if (typeof id !== 'string' || id.length > 128 || !id.trim() || data.id !== physicalId(kind, id)) corrupt();
  return id;
}

export function publicationDocument(value: Publication, pk: string) {
  const { id, createdAt, revision, ownerId, seller, categoria, subcategoria, titulo, descripcion,
    precio, condicion, ubicacion, imagenes } = value;
  return {
    ...envelope('publication', id, pk), logicalId: id, sortId: sortId(id),
    createdAtMs: createdAt.getTime(), revision, ownerId,
    seller: { id: seller.id, nombre: seller.nombre, carrera: seller.carrera, verificado: seller.verificado },
    categoria, subcategoria, titulo, descripcion, precio, condicion, ubicacion, imagenes: [...imagenes],
    searchText: (titulo + '\n' + descripcion).toLocaleLowerCase('es'),
  };
}

export function readPublication(value: unknown, pk: string): Publication {
  const data = document(value, 'publication', pk);
  const id = logicalId(data, 'publication');
  const seller = fields(data.seller);
  const { createdAtMs, ownerId, revision } = data;
  if (typeof createdAtMs !== 'number' || !Number.isSafeInteger(createdAtMs) || createdAtMs < 0 ||
      createdAtMs >= 10_000_000_000_000 || typeof revision !== 'number' || !Number.isSafeInteger(revision) ||
      revision < 1 || (seller.id !== null && (typeof seller.id !== 'number' || !Number.isSafeInteger(seller.id))) ||
      typeof seller.verificado !== 'boolean') corrupt();
  // Validate the explicit projection before exposing it as a domain value.
  const content = {
    categoria: data.categoria, subcategoria: data.subcategoria, titulo: data.titulo, descripcion: data.descripcion,
    precio: data.precio, condicion: data.condicion, ubicacion: data.ubicacion, imagenes: data.imagenes,
  } as Publication;
  const { nombre, carrera } = seller;
  try {
    validateText(ownerId, 'ownerId', 64, true);
    validateText(nombre, 'nombre', 160, true);
    validateText(carrera, 'carrera', 160);
    validateContent(content);
  } catch { return corrupt(); }
  if (data.sortId !== sortId(id) || data.searchText !== (content.titulo + '\n' + content.descripcion).toLocaleLowerCase('es')) corrupt();
  return { ...content, imagenes: [...content.imagenes], id, ownerId, revision, createdAt: new Date(createdAtMs),
    seller: { id: seller.id, nombre, carrera, verificado: seller.verificado } };
}

export function chatDocument(chat: Chat, pk: string) {
  const { id, buyerId, sellerId, publicationId, createdAt } = chat;
  return { ...envelope('chat', id, pk), logicalId: id, sortId: sortId(id), buyerId, sellerId, publicationId, createdAt };
}

export function readChat(value: unknown, pk: string): Chat {
  const data = document(value, 'chat', pk);
  const id = logicalId(data, 'chat');
  const { buyerId, sellerId, publicationId, createdAt } = data;
  if (typeof createdAt !== 'number' || data.sortId !== sortId(id) || buyerId === sellerId) corrupt();
  try {
    messageText(buyerId, 'buyerId', 64);
    messageText(sellerId, 'sellerId', 64);
    messageText(publicationId, 'publicationId', 128);
    messageTime(createdAt);
  } catch { return corrupt(); }
  return { id, buyerId, sellerId, publicationId, createdAt };
}

export function messageDocument(message: Message, pk: string) {
  const { id, chatId, senderUserId, recipientUserId, texto, sentAt } = message;
  return { ...envelope('message', id, pk), logicalId: id, sortId: sortId(id),
    chatId, senderUserId, recipientUserId, texto, sentAt };
}

export function readMessage(value: unknown, pk: string): Message {
  const data = document(value, 'message', pk);
  const id = logicalId(data, 'message');
  const { chatId, senderUserId, recipientUserId, texto, sentAt } = data;
  if (typeof sentAt !== 'number' || data.sortId !== sortId(id)) corrupt();
  try {
    messageText(chatId, 'chatId', 128);
    messageText(senderUserId, 'senderUserId', 64);
    messageText(recipientUserId, 'recipientUserId', 64);
    messageText(texto, 'texto', 5000);
    messageTime(sentAt);
  } catch { return corrupt(); }
  return { id, chatId, senderUserId, recipientUserId, texto, sentAt };
}

export function eventDocument(event: MessageSent, pk: string) {
  const { eventId, correlationId, publicationId, messageId, chatId, senderUserId, recipientUserId, sentAt } = event;
  return { ...envelope('event', eventId, pk), eventId, correlationId, publicationId,
    messageId, chatId, senderUserId, recipientUserId, sentAt };
}
