(() => {
  'use strict';

  class Stack {
    #items;
    #top;
    #capacity;

    constructor(capacity) {
      if (!Number.isInteger(capacity) || capacity < 1) {
        throw new RangeError('Stack capacity must be an integer greater than or equal to 1');
      }

      this.#capacity = capacity;
      this.#items = [];
      this.#top = -1;
    }

    push(item) {
      if (this.isFull()) return false;
      this.#top++;
      this.#items[this.#top] = item;
      return true;
    }

    pop() {
      if (this.isEmpty()) return null;
      const item = this.#items[this.#top];
      this.#items[this.#top] = undefined;
      this.#top--;
      return item;
    }

    peek() {
      return this.isEmpty() ? null : this.#items[this.#top];
    }

    isEmpty() {
      return this.#top === -1;
    }

    isFull() {
      return this.#top === this.#capacity - 1;
    }

    size() {
      return this.#top + 1;
    }

    get top() {
      return this.#top;
    }

    get capacity() {
      return this.#capacity;
    }

    clear() {
      this.#items = [];
      this.#top = -1;
    }

    toArray() {
      return this.#items.slice(0, this.#top + 1);
    }
  }

  globalThis.Stack = Stack;
})();
