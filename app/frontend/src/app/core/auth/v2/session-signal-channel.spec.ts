import { vi } from 'vitest';
import { SESSION_LOCK_NAME, WebLocksSessionLock } from './session-lock';
import {
  BroadcastSessionSignalChannel,
  parseSessionSignal,
  SESSION_SIGNAL_CHANNEL_NAME,
} from './session-signal-channel';

describe('parseSessionSignal', () => {
  it('acepta únicamente los tipos conocidos con la forma exacta {type}', () => {
    expect(parseSessionSignal({ type: 'logout' })).toEqual({ type: 'logout' });
    expect(parseSessionSignal({ type: 'session-rotated' })).toEqual({ type: 'session-rotated' });
  });

  it('descarta mensajes con datos extra, tipos desconocidos o formas inválidas', () => {
    expect(parseSessionSignal({ type: 'logout', token: 'x' })).toBeNull();
    expect(parseSessionSignal({ type: 'session-rotated', csrfToken: 'x' })).toBeNull();
    expect(parseSessionSignal({ type: 'steal' })).toBeNull();
    expect(parseSessionSignal({})).toBeNull();
    expect(parseSessionSignal('logout')).toBeNull();
    expect(parseSessionSignal(null)).toBeNull();
  });
});

describe('BroadcastSessionSignalChannel', () => {
  class FakeBroadcastChannel {
    static instances: FakeBroadcastChannel[] = [];
    readonly posted: unknown[] = [];
    private readonly handlers = new Set<(event: MessageEvent) => void>();

    constructor(readonly name: string) {
      FakeBroadcastChannel.instances.push(this);
    }

    postMessage(message: unknown): void {
      this.posted.push(message);
    }
    addEventListener(_: string, handler: (event: MessageEvent) => void): void {
      this.handlers.add(handler);
    }
    removeEventListener(_: string, handler: (event: MessageEvent) => void): void {
      this.handlers.delete(handler);
    }
    emit(data: unknown): void {
      for (const handler of this.handlers) handler({ data } as MessageEvent);
    }
  }

  beforeEach(() => {
    FakeBroadcastChannel.instances = [];
    vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('publica solo {type} aunque se le pase un objeto con más campos', () => {
    const channel = new BroadcastSessionSignalChannel();
    const hostile = { type: 'logout', token: 'jwt', csrfToken: 'csrf' } as never;

    channel.post(hostile);

    const fake = FakeBroadcastChannel.instances[0];
    expect(fake.name).toBe(SESSION_SIGNAL_CHANNEL_NAME);
    expect(fake.posted).toEqual([{ type: 'logout' }]);
  });

  it('entrega señales válidas e ignora cualquier otra cosa', () => {
    const channel = new BroadcastSessionSignalChannel();
    const listener = vi.fn();
    const unsubscribe = channel.subscribe(listener);
    const fake = FakeBroadcastChannel.instances[0];

    fake.emit({ type: 'logout' });
    fake.emit({ type: 'logout', token: 'x' });
    fake.emit({ jwt: 'x' });
    unsubscribe();
    fake.emit({ type: 'logout' });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ type: 'logout' });
  });

  it('sin BroadcastChannel es un no-op (no es el mutex)', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    const channel = new BroadcastSessionSignalChannel();

    expect(() => channel.post({ type: 'logout' })).not.toThrow();
    expect(channel.subscribe(vi.fn())).toBeTypeOf('function');
  });

  it('no expone ninguna operación de exclusión mutua', () => {
    const channel = new BroadcastSessionSignalChannel();

    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(channel)).sort()).toEqual([
      'constructor',
      'post',
      'subscribe',
    ]);
  });
});

describe('WebLocksSessionLock', () => {
  const original = Object.getOwnPropertyDescriptor(globalThis.navigator, 'locks');

  function setLocks(value: unknown): void {
    Object.defineProperty(globalThis.navigator, 'locks', { value, configurable: true });
  }

  afterEach(() => {
    if (original) Object.defineProperty(globalThis.navigator, 'locks', original);
    else delete (globalThis.navigator as unknown as { locks?: unknown }).locks;
  });

  it('sin navigator.locks informa "unavailable" y no ejecuta la tarea', async () => {
    setLocks(undefined);
    const task = vi.fn().mockResolvedValue('x');

    expect(await new WebLocksSessionLock().run(SESSION_LOCK_NAME, task)).toEqual({
      kind: 'unavailable',
    });
    expect(task).not.toHaveBeenCalled();
  });

  it('con Web Locks ejecuta la tarea dentro de un lock exclusivo', async () => {
    const request = vi.fn(
      async (_name: string, _options: unknown, callback: () => Promise<unknown>) => callback(),
    );
    setLocks({ request });

    const result = await new WebLocksSessionLock().run(SESSION_LOCK_NAME, async () => 42);

    expect(result).toEqual({ kind: 'acquired', value: 42 });
    expect(request).toHaveBeenCalledWith(
      SESSION_LOCK_NAME,
      { mode: 'exclusive' },
      expect.any(Function),
    );
  });

  it('un error de la tarea se propaga y no se confunde con "unavailable"', async () => {
    setLocks({
      request: async (_n: string, _o: unknown, callback: () => Promise<unknown>) => callback(),
    });

    await expect(
      new WebLocksSessionLock().run(SESSION_LOCK_NAME, async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
  });

  it('si el navegador rechaza el lock sin entrar (p. ej. SecurityError) no hay exclusión: "unavailable"', async () => {
    setLocks({ request: () => Promise.reject(new DOMException('opaque origin', 'SecurityError')) });
    const task = vi.fn();

    expect(await new WebLocksSessionLock().run(SESSION_LOCK_NAME, task)).toEqual({
      kind: 'unavailable',
    });
    expect(task).not.toHaveBeenCalled();
  });
});
