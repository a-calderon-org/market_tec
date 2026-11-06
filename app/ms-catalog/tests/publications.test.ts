import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { PublicationService } from '../src/application/use-cases/publication-service.js';
import { InMemoryPublicationRepository } from '../src/adapters/out/in-memory-publication-repository.js';
import type { PublicationActor } from '../src/application/ports/in/publications.js';
import type { ImageStoragePort } from '../src/application/ports/out/image-storage-port.js';
import type { PublicationContent, PublicationFilter } from '../src/domain/publication.js';

const owner: PublicationActor = { userId: 'usr-owner', seller: { id: 101, nombre: 'Ana', carrera: 'Computación', verificado: true } };
const other: PublicationActor = { ...owner, userId: 'usr-other' };
const content: PublicationContent = { categoria: 'Electrónica', subcategoria: 'Laptops', titulo: 'Laptop Dell',
  descripcion: 'En excelente estado', precio: 85000, condicion: 'Usado', ubicacion: 'Campus San Carlos', imagenes: [] };
const date = new Date('2026-11-04T12:00:00Z');
const placeholder = 'https://catalog.example.invalid/placeholder.svg';
const noImages: ImageStoragePort = { async assertUsableBy(_owner, urls) { if (urls.length) throw new Error('Unregistered image'); } };

function fixture(images = noImages) {
  const repository = new InMemoryPublicationRepository();
  let sequence = 0;
  const service = new PublicationService(repository, images, () => `pub-${++sequence}`, () => date, placeholder);
  return { repository, service };
}

test('create derives ownership from actor and returns compatible dates without internal metadata', async () => {
  const { service, repository } = fixture();
  const result = await service.create(owner, { ...content, ownerId: other.userId, id: 'forged', createdAt: 0 } as PublicationContent);
  assert.equal(result.id, 'pub-1');
  assert.equal(result.vendedor.userId, owner.userId);
  assert.equal(result.vendedor.id, 101);
  assert.equal(result.fechaPublicacion, '2026-11-04T12:00:00.000Z');
  assert.equal(result.createdAt, Math.floor(date.getTime() / 1000));
  assert.equal(result.imagen, placeholder);
  assert.equal(result.estado, 'activo');
  assert.equal('ownerId' in result, false);
  assert.equal('revision' in result, false);
  assert.equal((await repository.findById(result.id))?.ownerId, owner.userId);
});

test('only owner can update; ownership, original date and snapshot remain unchanged', async () => {
  const { service } = fixture();
  const created = await service.create(owner, content);
  await assert.rejects(service.update(other, created.id, content), { code: 'PUBLICATION_FORBIDDEN' });
  const updated = await service.update({ ...owner, seller: { ...owner.seller, nombre: 'Changed' } }, created.id,
    { ...content, titulo: 'Nuevo título', ownerId: other.userId } as PublicationContent);
  assert.equal(updated.titulo, 'Nuevo título');
  assert.deepEqual(updated.vendedor, created.vendedor);
  assert.equal(updated.fechaPublicacion, created.fechaPublicacion);
  assert.equal((await service.get(created.id)).titulo, 'Nuevo título');
});

test('detail and update report missing publication', async () => {
  const { service } = fixture();
  await assert.rejects(service.get('missing'), { code: 'PUBLICATION_NOT_FOUND' });
  await assert.rejects(service.update(owner, 'missing', content), { code: 'PUBLICATION_NOT_FOUND' });
});

const invalidContents: Partial<PublicationContent>[] = [
  { titulo: '  ' }, { titulo: 'x'.repeat(201) }, { categoria: '' }, { subcategoria: 'x'.repeat(101) },
  { descripcion: 'x'.repeat(5001) }, { ubicacion: 'x'.repeat(201) }, { precio: -1 }, { precio: NaN },
  { precio: Infinity }, { imagenes: ['javascript:alert(1)'] }, { imagenes: ['https://user:secret@example.invalid/a'] },
  { imagenes: ['not a URL'] }, { condicion: 10 as unknown as string },
];
for (const [index, patch] of invalidContents.entries()) {
  test(`invalid publication ${index} leaves storage unchanged`, async () => {
    const { service } = fixture();
    await assert.rejects(service.create(owner, { ...content, ...patch }), { code: 'INVALID_PUBLICATION' });
    assert.equal((await service.list()).totalRecords, 0);
  });
}

test('invalid identity and generated metadata are rejected', async () => {
  const { repository, service } = fixture();
  await assert.rejects(service.create({ ...owner, userId: '' }, content), { code: 'INVALID_PUBLICATION' });
  await assert.rejects(service.listOwned({ ...owner, userId: 'x'.repeat(65) }), { code: 'INVALID_PUBLICATION' });
  const invalidClock = new PublicationService(repository, noImages, () => 'id', () => new Date(NaN), placeholder);
  await assert.rejects(invalidClock.create(owner, content), { code: 'INVALID_PUBLICATION' });
  assert.equal((await service.list()).totalRecords, 0);
});

test('image ownership is checked before writes; rejection preserves existing publication', async () => {
  const calls: string[] = [];
  const { service } = fixture({ async assertUsableBy(userId, urls) {
    calls.push(userId);
    if (urls.includes('https://images.example.invalid/foreign.jpg')) throw new Error('Image forbidden');
  } });
  const created = await service.create(owner, { ...content, imagenes: ['https://images.example.invalid/owned.jpg'] });
  assert.equal(created.imagen, 'https://images.example.invalid/owned.jpg');
  await assert.rejects(service.update(owner, created.id, { ...content, imagenes: ['https://images.example.invalid/foreign.jpg'] }));
  assert.deepEqual(await service.get(created.id), created);
  await assert.rejects(service.create(owner, { ...content, imagenes: ['https://images.example.invalid/foreign.jpg'] }));
  assert.equal((await service.list()).totalRecords, 1);
  assert.deepEqual(calls, [owner.userId, owner.userId, owner.userId]);
});

test('filters combine before pagination and total count; owned listing isolates users', async () => {
  const { service } = fixture();
  await service.create(owner, { ...content, precio: 10 });
  await service.create(owner, { ...content, titulo: 'LAPTOP económica', precio: 20 });
  await service.create(other, { ...content, precio: 30 });
  await service.create(owner, { ...content, categoria: 'Libros', precio: 20 });
  const filter: PublicationFilter = { q: ' laptop ', categoria: 'Electrónica', precioMin: 10, precioMax: 30, sortBy: 'precio', sortDirection: 'asc', pageSize: 1, page: 2 };
  const result = await service.list(filter);
  assert.equal(result.totalRecords, 3);
  assert.equal(result.items[0]?.precio, 20);
  assert.equal(result.page, 2);
  assert.equal(result.pageSize, 1);
  assert.equal('imagenes' in result.items[0]!, false);
  assert.equal((await service.listOwned(other, filter)).totalRecords, 1);
  assert.equal((await service.list({ ...filter, page: 50 })).items.length, 0);
  assert.equal((await service.list({ q: 'excelente' })).totalRecords, 4);
  assert.equal((await service.list({ categoria: 'missing' })).totalRecords, 0);
});

test('sorting is stable with ID tie-break and defaults to descending date', async () => {
  const { repository } = fixture();
  let count = 0;
  const service = new PublicationService(repository, noImages, () => `id-${++count}`, () => new Date(date.getTime() + count * 1000), placeholder);
  await service.create(owner, content);
  await service.create(owner, content);
  assert.deepEqual((await service.list()).items.map(p => p.id), ['id-2', 'id-1']);
  assert.deepEqual((await service.list({ sortDirection: 'asc' })).items.map(p => p.id), ['id-1', 'id-2']);
  assert.deepEqual((await service.list({ sortBy: 'precio' })).items.map(p => p.id), ['id-1', 'id-2']);
});

const invalidFilters: PublicationFilter[] = [
  { page: 0 }, { page: 1.5 }, { page: Number.MAX_SAFE_INTEGER, pageSize: 100 },
  { pageSize: 101 }, { pageSize: 0 }, { precioMin: -1 }, { precioMax: Infinity },
  { precioMin: 5, precioMax: 4 }, { q: 'x'.repeat(201) }, { categoria: 'x'.repeat(101) },
  { sortBy: 'unknown' as 'fecha' }, { sortDirection: 'unknown' as 'asc' },
];
for (const [index, filter] of invalidFilters.entries()) {
  test(`invalid query ${index} is rejected`, async () => {
    await assert.rejects(fixture().service.list(filter), { code: 'INVALID_PUBLICATION' });
  });
}

test('repository and DTOs isolate mutable arrays, seller snapshots and dates', async () => {
  const { service, repository } = fixture();
  const created = await service.create(owner, content);
  const stored = (await repository.findById(created.id))!;
  stored.createdAt.setFullYear(2000);
  (stored.imagenes as string[]).push('https://bad.example.invalid/a');
  (created.vendedor as { nombre: string }).nombre = 'Tampered';
  const page = await repository.search({ page: 1, pageSize: 12, q: '', categoria: '', sortBy: 'fecha', sortDirection: 'desc', precioMin: 0, precioMax: 100000 });
  page.items[0]!.createdAt.setFullYear(2001);
  const fresh = await service.get(created.id);
  assert.equal(fresh.vendedor.nombre, 'Ana');
  assert.deepEqual(fresh.imagenes, []);
  assert.equal(fresh.fechaPublicacion, '2026-11-04T12:00:00.000Z');
});

test('duplicate IDs do not overwrite and stale revisions cannot replace newer writes', async () => {
  const { repository, service } = fixture();
  const created = await service.create(owner, content);
  const initial = (await repository.findById(created.id))!;
  await assert.rejects(repository.insert(initial), { code: 'PUBLICATION_CONFLICT' });
  await service.update(owner, created.id, { ...content, titulo: 'Latest' });
  await assert.rejects(repository.replace({ ...initial, revision: 2 }, 1), { code: 'PUBLICATION_CONFLICT' });
  assert.equal((await service.get(created.id)).titulo, 'Latest');
});

test('concurrent updates detect conflict rather than silently losing a write', async () => {
  const { service } = fixture();
  const created = await service.create(owner, content);
  const results = await Promise.allSettled([
    service.update(owner, created.id, { ...content, titulo: 'First' }),
    service.update(owner, created.id, { ...content, titulo: 'Second' }),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  const failure = results.find(result => result.status === 'rejected');
  assert.equal(failure?.status === 'rejected' && failure.reason.code, 'PUBLICATION_CONFLICT');
});

test('malformed runtime inputs produce domain errors instead of TypeError', async () => {
  const { service } = fixture();
  for (const value of [null, undefined, [], 'invalid', 1]) {
    await assert.rejects(service.create(value as unknown as PublicationActor, content), { code: 'INVALID_PUBLICATION' });
    await assert.rejects(service.create(owner, value as unknown as PublicationContent), { code: 'INVALID_PUBLICATION' });
  }
  for (const value of [null, [], 'invalid', 1]) {
    await assert.rejects(service.list(value as unknown as PublicationFilter), { code: 'INVALID_PUBLICATION' });
  }
  assert.equal((await service.list()).totalRecords, 0);
});

test('invalid update content preserves the original publication', async () => {
  const { service } = fixture();
  const created = await service.create(owner, content);
  for (const patch of invalidContents) {
    await assert.rejects(service.update(owner, created.id, { ...content, ...patch }), { code: 'INVALID_PUBLICATION' });
    assert.deepEqual(await service.get(created.id), created);
  }
});

test('zero price, null condition and empty optional text are valid', async () => {
  const { service } = fixture();
  const result = await service.create(owner, { ...content, precio: 0, condicion: null, subcategoria: '', descripcion: '', ubicacion: '' });
  const page = await service.list({ precioMin: 0, precioMax: 0 });
  assert.equal(page.totalRecords, 1);
  assert.equal(page.items[0]?.id, result.id);
  assert.equal(result.condicion, null);
});

test('DTO keys and query defaults match the current catalog draft without changing it', async () => {
  // This checks the DTO surface, not full JSON Schema validation or HTTP conformance.
  const contract = JSON.parse(await readFile(new URL('../../../../contracts/openapi/catalog.json', import.meta.url), 'utf8'));
  const schemas = contract.components.schemas as Record<string, { required: string[]; properties: Record<string, unknown> }>;
  function checkKeys(value: object, schemaName: string) {
    const schema = schemas[schemaName]!;
    for (const key of schema.required) assert.ok(Object.hasOwn(value, key), `${schemaName} missing ${key}`);
    for (const key of Object.keys(value)) assert.ok(Object.hasOwn(schema.properties, key), `${schemaName} unexpected ${key}`);
  }
  const { service } = fixture();
  const detail = await service.create(owner, content);
  const page = await service.list();
  checkKeys(detail, 'PublicationDetailV1');
  checkKeys(detail.vendedor, 'SellerV1');
  checkKeys(page, 'PublicationPageV1');
  checkKeys(page.items[0]!, 'PublicationV1');
  const parameters = contract.components.parameters;
  assert.equal(page.page, parameters.Page.schema.default);
  assert.equal(page.pageSize, parameters.PageSize.schema.default);
  assert.equal(typeof detail.fechaPublicacion, 'string');
  assert.equal(Date.parse(detail.fechaPublicacion), detail.createdAt * 1000);
});
