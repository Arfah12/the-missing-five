import { PROTOCOL_VERSION } from '@tmf/shared';
/**
 * Minimal in-memory stand-in for a Socket.IO server, just enough to drive
 * registerSocketHandlers in tests without opening real network sockets.
 */
type Handler = (...args: unknown[]) => void;

export class FakeSocket {
  data: Record<string, unknown> = {};
  rooms = new Set<string>();
  received: { event: string; args: unknown[] }[] = [];
  private handlers = new Map<string, Handler>();
  connected = true;

  constructor(
    public id: string,
    public handshake: { auth: Record<string, unknown>; address: string },
    private io: FakeIo,
  ) {
    this.rooms.add(id);
  }

  on(event: string, fn: Handler) {
    this.handlers.set(event, fn);
    return this;
  }

  join(room: string) {
    this.rooms.add(room);
    return Promise.resolve();
  }

  leave(room: string) {
    this.rooms.delete(room);
    return Promise.resolve();
  }

  emit(event: string, ...args: unknown[]) {
    this.received.push({ event, args });
    return true;
  }

  /** Simulates the client sending an event and waits for the acknowledgement. */
  request<T = unknown>(event: string, ...args: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      const fn = this.handlers.get(event);
      if (!fn) return reject(new Error(`no handler for ${event}`));
      const timer = setTimeout(() => reject(new Error(`no ack for ${event}`)), 1000);
      fn(...args, (res: T) => {
        clearTimeout(timer);
        resolve(res);
      });
    });
  }

  send(event: string, ...args: unknown[]) {
    this.handlers.get(event)?.(...args);
  }

  disconnect(reason = 'transport close') {
    this.connected = false;
    this.io.sockets.delete(this.id);
    this.handlers.get('disconnect')?.(reason);
  }

  last(event: string): unknown[] | undefined {
    for (let i = this.received.length - 1; i >= 0; i--) {
      if (this.received[i].event === event) return this.received[i].args;
    }
    return undefined;
  }
}

export class FakeIo {
  sockets = new Map<string, FakeSocket>();
  private middleware: ((s: FakeSocket, next: (e?: Error) => void) => void)[] = [];
  private onConnection: ((s: FakeSocket) => void) | null = null;
  private seq = 0;

  use(fn: (s: FakeSocket, next: (e?: Error) => void) => void) {
    this.middleware.push(fn);
    return this;
  }

  on(event: string, fn: (s: FakeSocket) => void) {
    if (event === 'connection') this.onConnection = fn;
    return this;
  }

  private targets(room: string) {
    return [...this.sockets.values()].filter((s) => s.rooms.has(room));
  }

  to(room: string) {
    return {
      emit: (event: string, ...args: unknown[]) => {
        for (const s of this.targets(room)) s.emit(event, ...args);
        return true;
      },
    };
  }

  in(room: string) {
    return {
      socketsLeave: (leaveRoom: string) => {
        for (const s of this.targets(room)) s.rooms.delete(leaveRoom);
      },
    };
  }

  /** Connects a new client. Rejects with the middleware error, like connect_error. */
  connect(auth: Record<string, unknown> = { protocol: PROTOCOL_VERSION }): Promise<FakeSocket> {
    const socket = new FakeSocket(`s${++this.seq}`, { auth, address: '127.0.0.1' }, this);
    return new Promise((resolve, reject) => {
      const run = (i: number) => {
        if (i >= this.middleware.length) {
          this.sockets.set(socket.id, socket);
          this.onConnection?.(socket);
          resolve(socket);
          return;
        }
        this.middleware[i](socket, (e) => (e ? reject(e) : run(i + 1)));
      };
      run(0);
    });
  }
}
