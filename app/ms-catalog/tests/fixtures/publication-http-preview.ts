// Manual integration-test fixture. Never import from src or deploy this entry point.
import { createApp } from '../../src/app.js';
import { PublicationService } from '../../src/application/use-cases/publication-service.js';
import { InMemoryPublicationRepository } from '../../src/adapters/out/in-memory-publication-repository.js';

let sequence = 0;
const publications = new PublicationService(new InMemoryPublicationRepository(),
  { async assertUsableBy(_owner, images) { if (images.length) throw new Error('Images unavailable in test fixture'); } },
  () => `pub-${++sequence}`, () => new Date('2026-11-06T12:00:00Z'), 'https://example.invalid/placeholder.svg');
for (const price of [20, 10, 30]) {
  await publications.create({ userId: 'usr-preview', seller: { id: 101, nombre: 'Ana de prueba', carrera: 'Computación', verificado: false } },
    { categoria: 'Electrónica', subcategoria: 'Laptops', titulo: `Laptop de prueba ${price}`, descripcion: 'Datos sintéticos',
      precio: price, condicion: null, ubicacion: '', imagenes: [] });
}
const app = createApp({ port: 3100, serviceName: 'ms-catalog', logLevel: 'silent' }, {
  publications,
  async authenticate(request) {
    return request.headers.authorization === 'Bearer local-test-only' ? { userId: 'usr-preview' } : undefined;
  },
});
const server = app.listen(3100, '127.0.0.1', () => {
  console.log('Manual test fixture: http://127.0.0.1:3100/v1/publicaciones');
  console.log('Synthetic credential: Bearer local-test-only; stop with Ctrl+C. No JWT validation.');
});
server.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => { server.close(); server.closeAllConnections(); });
}
