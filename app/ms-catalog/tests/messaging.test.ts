import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MessagingService } from '../src/application/use-cases/messaging-service.js';
import { InMemoryChatRepository, InMemoryMessageRepository } from '../src/adapters/out/in-memory-messaging-repository.js';
import { InMemoryPublicationRepository } from '../src/adapters/out/in-memory-publication-repository.js';
import type { AuthenticatedPrincipal } from '../src/application/ports/in/messaging.js';
import type { MessageRepository } from '../src/application/ports/out/message-repository.js';
import type { PageRequest, Message, MessageSent } from '../src/domain/messaging.js';

const buyer = { userId: 'buyer' };
const seller = { userId: 'seller' };
const stranger = { userId: 'stranger' };
const timestamp = 1793966400;

async function fixture() {
  const chats = new InMemoryChatRepository();
  const messages = new InMemoryMessageRepository();
  const publications = new InMemoryPublicationRepository();
  for (const id of ['publication-1', 'publication-2']) {
    await publications.insert({ id, ownerId: seller.userId, createdAt: new Date(timestamp * 1000), revision: 1,
      seller: { id: 1, nombre: 'Ana', carrera: '', verificado: true }, categoria: 'Libros', subcategoria: '',
      titulo: 'Libro', descripcion: '', precio: 1000, condicion: null, ubicacion: '', imagenes: [] });
  }
  let sequence = 0;
  const nextId = () => `id-${String(++sequence).padStart(4, '0')}`;
  const service = new MessagingService(chats, messages, publications, nextId, () => timestamp);
  return { service, chats, messages, publications, nextId };
}

test('start binds seller to publication owner; self-contact and missing publications fail', async () => {
  const { service } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  assert.deepEqual(chat, { id: 'id-0001', publicationId: 'publication-1', buyerId: 'buyer', sellerId: 'seller', createdAt: timestamp });
  await assert.rejects(service.start(seller, 'publication-1'), { code: 'CHAT_FORBIDDEN' });
  await assert.rejects(service.start(buyer, 'missing'), { code: 'CHAT_NOT_FOUND' });
  assert.equal((await service.listChats(seller)).totalRecords, 1);
});

test('concurrent conversation starts across service instances are idempotent for the same buyer and publication', async () => {
  const { service, chats, messages, publications, nextId } = await fixture();
  const second = new MessagingService(chats, messages, publications, nextId, () => timestamp);
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) =>
    (i % 2 ? service : second).start(buyer, 'publication-1')));
  assert.equal(new Set(results.map(chat => chat.id)).size, 1);
  assert.equal((await service.listChats(buyer)).totalRecords, 1);
  assert.equal((await service.start(buyer, 'publication-2')).publicationId, 'publication-2');
  assert.notEqual((await service.start(stranger, 'publication-1')).id, results[0]!.id);
});

test('only participants see a conversation or its messages, with authorization before repository access', async () => {
  const { service, chats, publications } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  const guardedMessages: MessageRepository = {
    async append() { assert.fail('Unauthorized append'); },
    async listByChat() { assert.fail('Unauthorized read'); },
  };
  const guarded = new MessagingService(chats, guardedMessages, publications, () => 'unused', () => timestamp);
  assert.equal((await service.listChats(stranger)).totalRecords, 0);
  assert.equal((await service.listChats(seller)).items[0]!.id, chat.id);
  await assert.rejects(guarded.listMessages(stranger, chat.id), { code: 'CHAT_FORBIDDEN' });
  await assert.rejects(guarded.send(stranger, chat.id, 'secret', 'correlation'), { code: 'CHAT_FORBIDDEN' });
  await assert.rejects(guarded.listMessages(buyer, 'missing'), { code: 'CHAT_NOT_FOUND' });
  await assert.rejects(guarded.send(buyer, 'missing', 'hello', 'correlation'), { code: 'CHAT_NOT_FOUND' });
});

test('both directions derive sender and recipient; prepared events omit private message text', async () => {
  const { service, messages } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  const sent = await service.send(buyer, chat.id, 'Texto privado', 'request-1');
  const reply = await service.send(seller, chat.id, 'Respuesta', 'request-2');
  assert.equal(sent.senderUserId, buyer.userId);
  assert.equal(sent.recipientUserId, seller.userId);
  assert.equal(reply.senderUserId, seller.userId);
  assert.equal(reply.recipientUserId, buyer.userId);
  const events = messages.preparedEvents();
  assert.deepEqual(events[0], { eventId: 'id-0003', correlationId: 'request-1', publicationId: 'publication-1',
    messageId: sent.id, chatId: chat.id, senderUserId: buyer.userId, recipientUserId: seller.userId, sentAt: timestamp });
  assert.equal(events.length, 2);
  assert.doesNotMatch(JSON.stringify(events), /Texto privado|Respuesta|texto/);
  assert.deepEqual((await service.listMessages(seller, chat.id)).items, [sent, reply]);
});

test('chat pagination filters participants before count and uses stable timestamp/ID order', async () => {
  const { service } = await fixture();
  const first = await service.start(buyer, 'publication-1');
  const second = await service.start(buyer, 'publication-2');
  await service.start(stranger, 'publication-1');
  const result = await service.listChats(buyer, { page: 2, pageSize: 1 });
  assert.deepEqual(result, { items: [second], totalRecords: 2, page: 2, pageSize: 1 });
  assert.deepEqual((await service.listChats(buyer, { page: 1, pageSize: 1 })).items, [first]);
  assert.deepEqual((await service.listChats(buyer, { page: 3, pageSize: 1 })).items, []);
});

test('messages paginate within their chat with exact metadata, chronology and deterministic ties', async () => {
  const { service, chats, messages, publications, nextId } = await fixture();
  const first = await service.start(buyer, 'publication-1');
  const second = await service.start(buyer, 'publication-2');
  await service.send(buyer, second.id, 'Other thread', 'correlation');
  let clock = timestamp + 10;
  const timed = new MessagingService(chats, messages, publications, nextId, () => clock);
  await timed.send(buyer, first.id, 'Later', 'correlation');
  clock = timestamp;
  const earliest = await timed.send(seller, first.id, 'Earlier', 'correlation');
  const tied = await timed.send(buyer, first.id, 'Same time', 'correlation');
  assert.deepEqual(await service.listMessages(buyer, first.id, { page: 2, pageSize: 1 }),
    { items: [tied], totalRecords: 3, page: 2, pageSize: 1 });
  assert.equal((await service.listMessages(buyer, first.id)).items[0]!.id, earliest.id);
  assert.deepEqual((await service.listMessages(buyer, first.id, { page: 9, pageSize: 1 })).items, []);
});

test('concurrent sends retain every distinct message and matching prepared event', async () => {
  const { service, messages } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  await Promise.all(Array.from({ length: 40 }, (_, i) => service.send(i % 2 ? buyer : seller, chat.id, `message ${i}`, `request-${i}`)));
  const result = await service.listMessages(buyer, chat.id, { pageSize: 100 });
  assert.equal(result.totalRecords, 40);
  assert.equal(new Set(result.items.map(message => message.id)).size, 40);
  assert.equal(messages.preparedEvents().length, 40);
});

for (const value of [null, undefined, {}, { userId: '' }, { userId: '  ' }, { userId: 7 }, { userId: 'x'.repeat(65) }]) {
  test(`invalid principal ${JSON.stringify(value)} is rejected by every entry point`, async () => {
    const { service } = await fixture();
    const principal = value as AuthenticatedPrincipal;
    await assert.rejects(service.start(principal, 'publication-1'), { code: 'INVALID_MESSAGE' });
    await assert.rejects(service.listChats(principal), { code: 'INVALID_MESSAGE' });
    await assert.rejects(service.listMessages(principal, 'chat'), { code: 'INVALID_MESSAGE' });
    await assert.rejects(service.send(principal, 'chat', 'hello', 'correlation'), { code: 'INVALID_MESSAGE' });
  });
}

test('invalid message, correlation, resource IDs and pagination never prepare a message', async () => {
  const { service, messages } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  for (const text of ['', '  ', 'x'.repeat(5001), null, 3, {}]) {
    await assert.rejects(service.send(buyer, chat.id, text as string, 'correlation'), { code: 'INVALID_MESSAGE' });
  }
  for (const correlation of ['', ' ', 'x'.repeat(129), null]) {
    await assert.rejects(service.send(buyer, chat.id, 'hello', correlation as string), { code: 'INVALID_MESSAGE' });
  }
  for (const id of ['', ' ', 'x'.repeat(129), null]) {
    await assert.rejects(service.start(buyer, id as string), { code: 'INVALID_MESSAGE' });
    await assert.rejects(service.listMessages(buyer, id as string), { code: 'INVALID_MESSAGE' });
  }
  for (const page of [null, [], { page: 0 }, { page: 1.5 }, { pageSize: 0 }, { pageSize: 101 },
    { page: Number.MAX_SAFE_INTEGER, pageSize: 100 }, { page: NaN }, { pageSize: '12' }]) {
    await assert.rejects(service.listChats(buyer, page as PageRequest), { code: 'INVALID_MESSAGE' });
    await assert.rejects(service.listMessages(buyer, chat.id, page as PageRequest), { code: 'INVALID_MESSAGE' });
  }
  assert.equal((await service.listMessages(buyer, chat.id)).totalRecords, 0);
  assert.deepEqual(messages.preparedEvents(), []);
});

test('invalid generated IDs and clocks fail before writes', async () => {
  const { service, chats, messages, publications } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  for (const clock of [NaN, -1, 0.5, 10000000000, Infinity]) {
    const broken = new MessagingService(chats, messages, publications, () => 'valid', () => clock);
    await assert.rejects(broken.start(stranger, 'publication-1'), { code: 'INVALID_MESSAGE' });
    await assert.rejects(broken.send(buyer, chat.id, 'hello', 'correlation'), { code: 'INVALID_MESSAGE' });
  }
  const broken = new MessagingService(chats, messages, publications, () => '', () => timestamp);
  await assert.rejects(broken.start(stranger, 'publication-1'), { code: 'INVALID_MESSAGE' });
  await assert.rejects(broken.send(buyer, chat.id, 'hello', 'correlation'), { code: 'INVALID_MESSAGE' });
  let generated = 0;
  const brokenEvent = new MessagingService(chats, messages, publications,
    () => ++generated === 1 ? 'valid-message' : '', () => timestamp);
  await assert.rejects(brokenEvent.send(buyer, chat.id, 'hello', 'correlation'), { code: 'INVALID_MESSAGE' });
  assert.equal((await service.listMessages(buyer, chat.id)).totalRecords, 0);
  assert.equal((await service.listChats(stranger)).totalRecords, 0);
  assert.deepEqual(messages.preparedEvents(), []);
});

test('chat ID collision never replaces another conversation and tuple keys cannot alias', async () => {
  const { chats } = await fixture();
  const chat = { id: 'fixed', publicationId: 'a:b', buyerId: 'c', sellerId: 'owner', createdAt: timestamp };
  await chats.getOrCreate(chat);
  await assert.rejects(chats.getOrCreate({ ...chat, publicationId: 'other' }), { code: 'CHAT_CONFLICT' });
  const distinct = await chats.getOrCreate({ ...chat, id: 'other', publicationId: 'a', buyerId: 'b:c' });
  assert.equal(distinct.id, 'other');
  assert.deepEqual(await chats.findById('fixed'), chat);
});

test('duplicate message or event IDs and mismatched events fail atomically', async () => {
  const { service, messages } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  const sent = await service.send(buyer, chat.id, 'original', 'correlation');
  const event = messages.preparedEvents()[0]!;
  await assert.rejects(messages.append({ ...sent, texto: 'overwrite' }, { ...event, eventId: 'new-event' }), { code: 'CHAT_CONFLICT' });
  await assert.rejects(messages.append({ ...sent, id: 'new-message' }, { ...event, messageId: 'new-message' }), { code: 'CHAT_CONFLICT' });
  for (const patch of [{ messageId: 'wrong' }, { chatId: 'wrong' }, { senderUserId: 'wrong' },
    { recipientUserId: 'wrong' }, { sentAt: timestamp + 1 }]) {
    await assert.rejects(messages.append({ ...sent, id: 'new-message' },
      { ...event, eventId: 'new-event', messageId: 'new-message', ...patch }), { code: 'INVALID_MESSAGE' });
  }
  assert.deepEqual((await service.listMessages(buyer, chat.id)).items, [sent]);
  assert.deepEqual(messages.preparedEvents(), [event]);
});

test('repository failure rejects send without a success result', async () => {
  const { service, chats, publications } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  const failing: MessageRepository = { async append() { throw new Error('storage unavailable'); },
    async listByChat() { throw new Error('storage unavailable'); } };
  const broken = new MessagingService(chats, failing, publications, () => 'id', () => timestamp);
  await assert.rejects(broken.send(buyer, chat.id, 'hello', 'correlation'), /storage unavailable/);
});

test('fake repositories isolate all inputs, read results and event inspections by defensive copies', async () => {
  const { service, chats, messages } = await fixture();
  const chat = await service.start(buyer, 'publication-1');
  const expectedChat = { ...chat };
  (chat as { sellerId: string }).sellerId = 'attacker';
  const read = await chats.findById(chat.id);
  assert.deepEqual(read, expectedChat);
  (read as { buyerId: string }).buyerId = 'attacker';
  const listed = await service.listChats(buyer);
  (listed.items[0] as { sellerId: string }).sellerId = 'attacker';
  const sent = await service.send(buyer, chat.id, 'original', 'correlation');
  const expected = { ...sent };
  (sent as { texto: string }).texto = 'changed';
  const messageList = await service.listMessages(buyer, chat.id);
  (messageList.items[0] as { texto: string }).texto = 'changed again';
  const events = messages.preparedEvents();
  (events[0] as { recipientUserId: string }).recipientUserId = 'attacker';
  assert.deepEqual((await service.listMessages(seller, chat.id)).items, [expected]);
  assert.equal(messages.preparedEvents()[0]!.recipientUserId, 'seller');
  const direct: Message = { ...expected, id: 'direct' };
  const directEvent: MessageSent = { ...messages.preparedEvents()[0]!, eventId: 'direct-event', messageId: direct.id };
  await messages.append(direct, directEvent);
  (direct as { texto: string }).texto = 'changed';
  (directEvent as { recipientUserId: string }).recipientUserId = 'changed';
  assert.equal((await service.listMessages(buyer, chat.id)).items.find(message => message.id === 'direct')!.texto, 'original');
  assert.equal(messages.preparedEvents().find(event => event.eventId === 'direct-event')!.recipientUserId, 'seller');
  const directChat = { ...expectedChat, id: 'direct-chat', buyerId: 'another-buyer' };
  const directChatSnapshot = { ...directChat };
  await chats.getOrCreate(directChat);
  directChat.sellerId = 'changed';
  assert.deepEqual(await chats.findById('direct-chat'), directChatSnapshot);
});
