(() => {
  'use strict';

  class Queue {
    #items;
    #front;
    #rear;
    #count;
    #capacity;

    constructor(capacity) {
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new RangeError('Queue capacity must be an integer greater than or equal to 1');
      }

      this.#capacity = capacity;
      this.#items = [];
      this.#front = 0;
      this.#rear = -1;
      this.#count = 0;
    }

    enqueueLine(item) {
      if (this.isFull()) return false;
      this.#rear++;
      this.#items[this.#rear] = item;
      this.#count++;
      return true;
    }

    dequeueLine() {
      if (this.isEmpty()) return null;
      const item = this.#items[this.#front];
      for (let i = 0; i < this.#count - 1; i++) {
        this.#items[i] = this.#items[i + 1];
      }
      this.#rear--;
      this.#count--;
      return item;
    }

    enqueueRing(item) {
      if (this.isFull()) return false;
      this.#rear = (this.#rear + 1) % this.#capacity;
      this.#items[this.#rear] = item;
      this.#count++;
      return true;
    }

    dequeueRing() {
      if (this.isEmpty()) return null;
      const item = this.#items[this.#front];
      this.#front = (this.#front + 1) % this.#capacity;
      this.#count--;
      return item;
    }

    peek() {
      return this.isEmpty() ? null : this.#items[this.#front];
    }

    isEmpty() {
      return this.#count === 0;
    }

    isFull() {
      return this.#count === this.#capacity;
    }

    size() {
      return this.#count;
    }

    get front() {
      return this.#front;
    }

    get rear() {
      return this.#rear;
    }

    get capacity() {
      return this.#capacity;
    }

    clear() {
      this.#front = 0;
      this.#rear = -1;
      this.#count = 0;
    }

    toArray() {
      const items = [];
      for (let i = 0; i < this.#count; i++) {
        items.push(this.#items[(this.#front + i) % this.#capacity]);
      }
      return items;
    }
  }

  globalThis.Queue = Queue;
})();
