import Resolver from "mtproto/common/resolver.ts";

export default class TaskQueue {
  #max: number;
  #pending: Array<() => Promise<void>> = [];
  #running: Map<() => Promise<void>, Promise<void>> = new Map();
  #error: Error | null = null;
  #resolver = new Resolver<void>();

  get wait() {
    return this.#resolver.promise;
  }

  constructor(max: number) {
    this.#max = max;
  }

  async #wrap(fn: () => Promise<void>) {
    try {
      await fn();
      this.#running.delete(fn);
      if (this.#error == null) {
        if (this.#pending.length > 0) {
          if (this.#running.size < this.#max) {
            const head = this.#pending.shift()!;
            this.#running.set(head, this.#wrap(head));
          }
        } else if (this.#running.size == 0) {
          this.#resolver.resolve();
          this.#resolver = new Resolver<void>();
        }
      }
    } catch (e) {
      this.#running.delete(fn);
      if (this.#error == null) {
        this.#error = e;
      }
      if (this.#running.size == 0) {
        this.#resolver.reject(this.#error);
        this.#resolver = new Resolver<void>();
      }
    }
  }

  enqueue(fn: () => Promise<void>) {
    if (this.#running.size < this.#max) {
      this.#running.set(fn, this.#wrap(fn));
    } else {
      this.#pending.push(fn);
    }
  }
}
