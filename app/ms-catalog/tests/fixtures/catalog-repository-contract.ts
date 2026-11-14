import assert from 'node:assert/strict';
import type { PublicationRepository } from '../../src/application/ports/out/publication-repository.js';
import type { ChatRepository } from '../../src/application/ports/out/chat-repository.js';
import type { MessageRepository } from '../../src/application/ports/out/message-repository.js';
import { PublicationService } from '../../src/application/use-cases/publication-service.js';
import { MessagingService } from '../../src/application/use-cases/messaging-service.js';
import { normalizeQuery } from '../../src/domain/publication.js';
import type { Publication } from '../../src/domain/publication.js';
import type { Chat, Message, MessageSent } from '../../src/domain/messaging.js';

export interface CatalogRepositories {
  publications: PublicationRepository;
  chats: ChatRepository;
  messages: MessageRepository;
}

export const publicationFixture: Publication = {
  id: 'a/niño#01?', ownerId: 'seller', revision: 1, createdAt: new Date(1793966400001),
  seller: { id: 1, nombre: 'Ana', carrera: '', verificado: true },
  categoria: 'Libros', subcategoria: '', titulo: 'ÁLBUM', descripcion: 'Ilustrado',
  precio: 20, condicion: null, ubicacion: '', imagenes: [],
};

const page = { page: 1, pageSize: 1 };
const seconds = 1793966400;

export async function assertCatalogRepositoryContract(repositories: CatalogRepositories, other = repositories) {
  const { publications, chats, messages } = repositories;
  const original = publicationFixture;
  const first = { ...original, id: 'b' };
  const second = { ...original, id: 'a' };
  const third = { ...original, id: 'c', precio: 10, createdAt: new Date(original.createdAt.getTime() + 1) };
  const excluded = { ...original, id: 'd', ownerId: 'other' };
  assert.equal(await publications.findById('missing'), undefined);
  for (const row of [original, first, second, third, excluded]) await publications.insert(row);
  assert.deepEqual(await publications.findById(original.id), original);
  await assert.rejects(publications.insert({ ...original, titulo: 'duplicate' }), { code: 'PUBLICATION_CONFLICT' });
  await assert.rejects(publications.replace({ ...original, ownerId: 'other', revision: 2 }, 1), { code: 'PUBLICATION_CONFLICT' });

  const filter = { categoria: 'Libros', q: ' áLBUM\nILUS ', precioMin: 10, precioMax: 20, pageSize: 2 };
  for (const [sortBy, sortDirection, expected] of [
    ['precio', 'asc', ['c', 'a']],
    ['precio', 'desc', ['a', original.id]],
    ['fecha', 'asc', ['a', original.id]],
    ['fecha', 'desc', ['c', 'a']],
  ] as const) {
    const result = await publications.search(normalizeQuery({ ...filter, sortBy, sortDirection }, 'seller'));
    assert.deepEqual(result.items.map(row => row.id), expected);
    assert.equal(result.totalRecords, 4);
  }
  const global = await publications.search(normalizeQuery({ ...filter, page: 2, sortBy: 'precio', sortDirection: 'asc' }));
  assert.deepEqual(global.items.map(row => row.id), [original.id, 'b']);
  assert.equal(global.totalRecords, 5);
  assert.deepEqual(await publications.search(normalizeQuery({ ...filter, page: 9 })), { items: [], totalRecords: 5 });
  assert.deepEqual(await publications.search(normalizeQuery({ ...filter, categoria: 'libros' })), { items: [], totalRecords: 0 });

  const catalog = new PublicationService(publications, { async assertUsableBy() {} }, () => 'unused',
    () => new Date(), 'https://example.test/default.png');
  const owner = { userId: 'seller', seller: original.seller };
  await assert.rejects(catalog.update({ ...owner, userId: 'stranger' }, original.id, original), { code: 'PUBLICATION_FORBIDDEN' });
  assert.equal((await catalog.listOwned(owner)).totalRecords, 4);
  const replacements = await Promise.allSettled([
    publications.replace({ ...original, revision: 2, titulo: 'primero' }, 1),
    other.publications.replace({ ...original, revision: 2, titulo: 'segundo' }, 1),
  ]);
  assert.equal(replacements.filter(result => result.status === 'fulfilled').length, 1);
  const loser = replacements.find(result => result.status === 'rejected');
  assert.equal(loser?.reason.code, 'PUBLICATION_CONFLICT');
  const winner = replacements[0]?.status === 'fulfilled' ? publications : other.publications;
  assert.equal((await winner.findById(original.id))?.revision, 2);

  let id = 0;
  const messaging = new MessagingService(chats, messages, publications, () => 'resource-' + ++id, () => seconds);
  const buyer = { userId: 'buyer' };
  const chat = await messaging.start(buyer, original.id);
  const retry = await other.chats.getOrCreate({ ...chat, id: 'retry' });
  assert.deepEqual(retry, chat);
  await assert.rejects(chats.getOrCreate({ ...chat, publicationId: 'b' }), { code: 'CHAT_CONFLICT' });
  const sameTime: Chat = { ...chat, id: 'a/chat', publicationId: 'b' };
  const parallel = await Promise.all([
    chats.getOrCreate(sameTime), other.chats.getOrCreate({ ...sameTime, id: 'b/chat' }),
  ]);
  assert.equal(parallel[0].id, parallel[1].id);
  const participantList = await chats.listForParticipant(buyer.userId, page);
  assert.equal(participantList.totalRecords, 2);
  assert.deepEqual(participantList.items, [parallel[0]]);
  assert.equal((await chats.listForParticipant(owner.userId, page)).totalRecords, 2);
  assert.deepEqual(await chats.listForParticipant('stranger', page), { ...page, items: [], totalRecords: 0 });

  await assert.rejects(messaging.send({ userId: 'stranger' }, chat.id, 'hello', 'trace'), { code: 'CHAT_FORBIDDEN' });
  await assert.rejects(messaging.listMessages({ userId: 'stranger' }, chat.id), { code: 'CHAT_FORBIDDEN' });
  const message = await messaging.send(buyer, chat.id, 'hola', 'trace');
  assert.equal(message.recipientUserId, 'seller');
  const sent = await messaging.send(owner, chat.id, 'respuesta', 'trace');
  assert.equal(sent.recipientUserId, 'buyer');
  await messaging.send(buyer, parallel[0].id, 'otro chat', 'trace');

  const next: Message = { ...message, id: 'a/message', sentAt: seconds };
  const event: MessageSent = {
    eventId: 'manual-event', correlationId: 'trace', publicationId: chat.publicationId,
    messageId: next.id, chatId: next.chatId, senderUserId: next.senderUserId,
    recipientUserId: next.recipientUserId, sentAt: next.sentAt,
  };
  await messages.append(next, event);
  const collidingMessage = { ...next, id: 'never-persisted', chatId: parallel[0].id };
  await assert.rejects(messages.append(collidingMessage, {
    ...event, messageId: collidingMessage.id, chatId: collidingMessage.chatId,
  }), { code: 'CHAT_CONFLICT' });
  // A failed message create must also roll back the event reservation.
  const otherMessage = { ...next, chatId: parallel[0].id };
  const newEvent = { ...event, eventId: 'reusable-event', chatId: otherMessage.chatId };
  await assert.rejects(messages.append(otherMessage, newEvent), { code: 'CHAT_CONFLICT' });
  await messages.append(collidingMessage, { ...newEvent, messageId: collidingMessage.id });
  assert.deepEqual(await messages.listByChat(chat.id, page), { ...page, items: [next], totalRecords: 3 });
  assert.equal((await messages.listByChat(parallel[0].id, page)).totalRecords, 2);
  const latePage = { page: 999, pageSize: 2 };
  assert.deepEqual(await messages.listByChat(chat.id, latePage), { ...latePage, items: [], totalRecords: 3 });

  await assert.rejects(publications.delete(first.id, 'other', first.revision), { code: 'PUBLICATION_CONFLICT' });
  await assert.rejects(publications.delete(first.id, first.ownerId, first.revision + 1), { code: 'PUBLICATION_CONFLICT' });
  await publications.delete(first.id, first.ownerId, first.revision);
  assert.equal(await publications.findById(first.id), undefined);
  assert.equal((await catalog.listOwned(owner)).totalRecords, 3);

  return { originalId: original.id, chatId: chat.id };
}
