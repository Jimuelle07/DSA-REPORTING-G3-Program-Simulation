(() => {
  'use strict';

  const ANCHORS = {
    init: ['q->front = 0;', 'q->rear = -1;', 'q->count = 0;', 'q->capacity = capacity;'],
    clear: ['{ q->front = 0; q->rear = -1; q->count = 0; }'],
    peek: ['if (isEmpty(q)) {', 'return NULL;', 'return &q->items[q->front];'],
    enqueueLine: ['if (isFull(q)) {', 'return false;', 'q->rear++;', 'q->items[q->rear] = c;', 'q->count++;', 'return true;'],
    dequeueLine: ['if (isEmpty(q)) {', 'return false;', '*out = q->items[q->front];', 'for (i = 0; i < q->count - 1; i++) {', 'q->items[i] = q->items[i + 1];', 'q->rear--;', 'q->count--;', 'return true;'],
    enqueueRing: ['if (isFull(q)) {', 'return false;', 'q->rear = (q->rear + 1) % q->capacity;', 'q->items[q->rear] = c;', 'q->count++;', 'return true;'],
    dequeueRing: ['if (isEmpty(q)) {', 'return false;', '*out = q->items[q->front];', 'q->front = (q->front + 1) % q->capacity;', 'q->count--;', 'return true;'],
    arrive: ['c.ticket = nextTicket++;', 'snprintf(c.order, MAX_ORDER, "%s", order);', 'if (ringMode) {', 'ok = enqueueRing(&lane, c);', 'ok = enqueueLine(&lane, c);', 'if (!ok) {', 'turnedAway++;', 'return ok;'],
    serve: ['if (ringMode) {', 'return dequeueRing(&lane, out);', 'return dequeueLine(&lane, out);']
  };
  for (const snippets of Object.values(ANCHORS)) Object.freeze(snippets);
  Object.freeze(ANCHORS);

  const ARRIVE_HEAD = () => [
    ['arrive', 'c.ticket = nextTicket++;'],
    ['arrive', 'snprintf(c.order, MAX_ORDER, "%s", order);'],
    ['arrive', 'if (ringMode) {']
  ];
  const ENQUEUE_OK = (ring) => (ring
    ? [
      ['enqueueRing', 'if (isFull(q)) {'],
      ['enqueueRing', 'q->rear = (q->rear + 1) % q->capacity;'],
      ['enqueueRing', 'q->items[q->rear] = c;'],
      ['enqueueRing', 'q->count++;'],
      ['enqueueRing', 'return true;']
    ]
    : [
      ['enqueueLine', 'if (isFull(q)) {'],
      ['enqueueLine', 'q->rear++;'],
      ['enqueueLine', 'q->items[q->rear] = c;'],
      ['enqueueLine', 'q->count++;'],
      ['enqueueLine', 'return true;']
    ]);
  const ENQUEUE_FULL = (ring) => {
    const fn = ring ? 'enqueueRing' : 'enqueueLine';
    return [
      [fn, 'if (isFull(q)) {'],
      [fn, 'return false;']
    ];
  };
  const ARRIVE_TAIL = (overflow) => (overflow
    ? [['arrive', 'if (!ok) {'], ['arrive', 'turnedAway++;'], ['arrive', 'return ok;']]
    : [['arrive', 'if (!ok) {'], ['arrive', 'return ok;']]);

  const SERVE_HEAD = (ring) => [
    ['serve', 'if (ringMode) {'],
    ['serve', ring ? 'return dequeueRing(&lane, out);' : 'return dequeueLine(&lane, out);']
  ];
  const DEQUEUE_EMPTY = (ring) => {
    const fn = ring ? 'dequeueRing' : 'dequeueLine';
    return [
      [fn, 'if (isEmpty(q)) {'],
      [fn, 'return false;']
    ];
  };
  const DEQUEUE_LINE_OK = (n) => {
    const trace = [
      ['dequeueLine', 'if (isEmpty(q)) {'],
      ['dequeueLine', '*out = q->items[q->front];'],
      ['dequeueLine', 'for (i = 0; i < q->count - 1; i++) {', n]
    ];
    if (n - 1 > 0) trace.push(['dequeueLine', 'q->items[i] = q->items[i + 1];', n - 1]);
    trace.push(
      ['dequeueLine', 'q->rear--;'],
      ['dequeueLine', 'q->count--;'],
      ['dequeueLine', 'return true;']
    );
    return trace;
  };
  const DEQUEUE_RING_OK = () => [
    ['dequeueRing', 'if (isEmpty(q)) {'],
    ['dequeueRing', '*out = q->items[q->front];'],
    ['dequeueRing', 'q->front = (q->front + 1) % q->capacity;'],
    ['dequeueRing', 'q->count--;'],
    ['dequeueRing', 'return true;']
  ];

  class DriveThru {
    #QueueClass;
    #queue;
    #ringMode;
    #nextTicket;
    #turnedAway;

    constructor(capacity = 5) {
      this.#QueueClass = globalThis.Queue;
      this.#queue = new this.#QueueClass(capacity);
      this.#ringMode = false;
      this.#nextTicket = 1;
      this.#turnedAway = 0;
    }

    get queue() {
      return this.#queue;
    }

    get ringMode() {
      return this.#ringMode;
    }

    get nextTicket() {
      return this.#nextTicket;
    }

    get turnedAway() {
      return this.#turnedAway;
    }

    #watch() {
      return {
        front: this.#queue.front,
        rear: this.#queue.rear,
        count: this.#queue.size(),
        capacity: this.#queue.capacity,
        ringMode: this.#ringMode,
        turnedAway: this.#turnedAway
      };
    }

    #result(op, options = {}) {
      return {
        op,
        ok: options.ok ?? true,
        reason: options.reason ?? null,
        car: options.car ?? null,
        shifted: options.shifted ?? 0,
        wrapped: options.wrapped ?? false,
        cleared: options.cleared ?? [],
        callTrace: options.callTrace ?? '',
        trace: options.trace ?? [],
        watch: this.#watch(),
        log: options.log ?? ''
      };
    }

    arrive(order) {
      const text = String(order ?? '').slice(0, DriveThru.MAX_ORDER - 1);
      const ticket = this.#nextTicket++;
      const car = { ticket, order: text };
      const ring = this.#ringMode;
      const enqueueName = ring ? 'enqueueRing' : 'enqueueLine';
      const oldRear = this.#queue.rear;
      const ok = ring ? this.#queue.enqueueRing(car) : this.#queue.enqueueLine(car);
      const wrapped = ring && ok && this.#queue.rear < oldRear;
      if (!ok) this.#turnedAway++;

      const watch = this.#watch();
      const callTrace = ok
        ? `arrive(${JSON.stringify(text)}) → ${enqueueName}(&lane, c) → true`
        : `arrive(${JSON.stringify(text)}) → ${enqueueName}(&lane, c) → false → turnedAway = ${this.#turnedAway}`;
      const log = ok
        ? `ARRIVE  ${enqueueName}(#${ticket} ${text}) → true  front ${watch.front} · rear ${watch.rear} · size ${watch.count}/${watch.capacity}`
        : `ARRIVE  ${enqueueName}(#${ticket} ${text}) → false  OVERFLOW · turned away ${this.#turnedAway}`;
      return this.#result('arrive', {
        ok,
        reason: ok ? null : 'overflow',
        car,
        wrapped,
        callTrace,
        trace: [...ARRIVE_HEAD(), ...(ok ? ENQUEUE_OK(ring) : ENQUEUE_FULL(ring)), ...ARRIVE_TAIL(!ok)],
        log
      });
    }

    serve() {
      const ring = this.#ringMode;
      const before = this.#queue.size();
      const oldFront = this.#queue.front;
      const car = ring ? this.#queue.dequeueRing() : this.#queue.dequeueLine();
      if (car === null) {
        const fn = ring ? 'dequeueRing' : 'dequeueLine';
        return this.#result('serve', {
          ok: false,
          reason: 'underflow',
          callTrace: `serve(&out) → ${fn}(&lane, out) → false`,
          trace: [...SERVE_HEAD(ring), ...DEQUEUE_EMPTY(ring)],
          log: `SERVE  ${fn}() → false  UNDERFLOW`
        });
      }

      const shifted = ring ? 0 : before - 1;
      const wrapped = ring && this.#queue.front < oldFront;
      const watch = this.#watch();
      const callTrace = `serve(&out) → ${ring ? 'dequeueRing' : 'dequeueLine'}(&lane, out) → true (#${car.ticket} ${car.order})`;
      const log = ring
        ? `SERVE  dequeueRing() → #${car.ticket} ${car.order}  front ${watch.front} · rear ${watch.rear} · size ${watch.count}/${watch.capacity}`
        : `SERVE  dequeueLine() → #${car.ticket} ${car.order}  ${shifted} car${shifted === 1 ? '' : 's'} rolled forward  front ${watch.front} · rear ${watch.rear} · size ${watch.count}/${watch.capacity}`;
      return this.#result('serve', {
        car,
        shifted,
        wrapped,
        callTrace,
        trace: [...SERVE_HEAD(ring), ...(ring ? DEQUEUE_RING_OK() : DEQUEUE_LINE_OK(before))],
        log
      });
    }

    peek() {
      const car = this.#queue.peek();
      const watch = this.#watch();
      const trace = [
        ['peek', 'if (isEmpty(q)) {'],
        car ? ['peek', 'return &q->items[q->front];'] : ['peek', 'return NULL;']
      ];
      return this.#result('peek', {
        car,
        callTrace: car ? `peek(&lane) → #${car.ticket} ${car.order}` : 'peek(&lane) → NULL',
        trace,
        log: car
          ? `PEEK  peek() → #${car.ticket} ${car.order}  size ${watch.count}/${watch.capacity}`
          : `PEEK  peek() → NULL  size ${watch.count}/${watch.capacity}`
      });
    }

    clear() {
      const cleared = this.#queue.toArray();
      const capacity = this.#queue.capacity;
      this.#queue.clear();
      return this.#result('clear', {
        cleared,
        callTrace: 'clear(&lane) → front = 0 · rear = -1 · count = 0',
        trace: [['clear', '{ q->front = 0; q->rear = -1; q->count = 0; }']],
        log: `CLEAR  clear(&lane)  size 0/${capacity}`
      });
    }

    reset(ringMode = this.#ringMode, capacity = this.#queue.capacity) {
      this.#ringMode = Boolean(ringMode);
      this.#queue = new this.#QueueClass(capacity);
      const mode = this.#ringMode ? 'RING' : 'STRAIGHT';
      return this.#result('reset', {
        callTrace: `init(&lane, ${capacity}) → ${mode}`,
        trace: [
          ['init', 'q->front = 0;'],
          ['init', 'q->rear = -1;'],
          ['init', 'q->count = 0;'],
          ['init', 'q->capacity = capacity;']
        ],
        log: `RESET  init(&lane, ${capacity})  ${mode}`
      });
    }
  }

  DriveThru.MAX_ORDER = 32;
  DriveThru.ANCHORS = ANCHORS;
  globalThis.DriveThru = DriveThru;
})();
