(() => {
  'use strict';

  const ANCHORS = {
    init: ['s->top = -1;', 's->capacity = capacity;'],
    clear: ['{ s->top = -1; }'],
    push: ['if (isFull(s)) {', 'return false;', 's->top++;', 's->items[s->top] = a;', 'return true;'],
    pop: ['if (isEmpty(s)) {', 'return false;', '*out = s->items[s->top];', 's->top--;', 'return true;'],
    peek: ['if (isEmpty(s)) {', 'return NULL;', 'return &s->items[s->top];'],
    evictOldest: ['init(&temp, s->capacity);', 'while (pop(s, &a)) {', 'push(&temp, a);', 'pop(&temp, &a);', 'while (pop(&temp, &a)) {', 'push(s, a);'],
    doAction: ['if (!isEmpty(&redoStack)) {', 'clear(&redoStack);', 'if (!push(&undoStack, a)) {', 'evictOldest(&undoStack);', 'push(&undoStack, a);', 'strcpy(doc, a.after);'],
    undo: ['if (!pop(&undoStack, &a)) {', 'return false;', 'strcpy(doc, a.before);', 'push(&redoStack, a);', 'return true;'],
    redo: ['if (!pop(&redoStack, &a)) {', 'return false;', 'strcpy(doc, a.after);', 'push(&undoStack, a);', 'return true;'],
    typeWord: ['if (need >= MAX_TEXT) {', 'return false;', "doAction(makeAction('+', word, after));"],
    deleteLastWord: ['if (end == 0) {', 'return false;', "doAction(makeAction('-', word, after));"]
  };
  for (const snippets of Object.values(ANCHORS)) Object.freeze(snippets);
  Object.freeze(ANCHORS);

  const PUSH_OK = (fn = 'push') => [
    [fn, 'if (isFull(s)) {'],
    [fn, 's->top++;'],
    [fn, 's->items[s->top] = a;'],
    [fn, 'return true;']
  ];
  const PUSH_FULL = () => [
    ['push', 'if (isFull(s)) {'],
    ['push', 'return false;']
  ];
  const POP_OK = () => [
    ['pop', 'if (isEmpty(s)) {'],
    ['pop', '*out = s->items[s->top];'],
    ['pop', 's->top--;'],
    ['pop', 'return true;']
  ];
  const POP_EMPTY = () => [
    ['pop', 'if (isEmpty(s)) {'],
    ['pop', 'return false;']
  ];
  const EVICT = (n) => [
    ['evictOldest', 'init(&temp, s->capacity);'],
    ['evictOldest', 'while (pop(s, &a)) {', n + 1],
    ['evictOldest', 'push(&temp, a);', n],
    ['evictOldest', 'pop(&temp, &a);'],
    ['evictOldest', 'while (pop(&temp, &a)) {', n],
    ['evictOldest', 'push(s, a);', n - 1]
  ];

  class History {
    #undoStack;
    #redoStack;
    #doc;
    #nextId;
    #capacity;
    #StackClass;

    constructor({ capacity = 6 } = {}) {
      this.#StackClass = globalThis.Stack;
      this.#capacity = capacity;
      this.#undoStack = new this.#StackClass(capacity);
      this.#redoStack = new this.#StackClass(capacity);
      this.#doc = '';
      this.#nextId = 1;
    }

    get doc() {
      return this.#doc;
    }

    get undoStack() {
      return this.#undoStack;
    }

    get redoStack() {
      return this.#redoStack;
    }

    get capacity() {
      return this.#capacity;
    }

    static makeLabel(sign, text) {
      return `${sign}"${text.slice(0, 27)}"`;
    }

    static makeReplaceLabel(oldText, newText) {
      return `"${oldText.slice(0, 12)}" → "${newText.slice(0, 12)}"`;
    }

    #watch() {
      return {
        undoTop: this.#undoStack.top,
        redoTop: this.#redoStack.top,
        capacity: this.#capacity,
        doc: this.#doc
      };
    }

    #result(op, options = {}) {
      return {
        op,
        ok: options.ok ?? true,
        reason: options.reason ?? null,
        action: options.action ?? null,
        stack: options.stack ?? null,
        invalidated: options.invalidated ?? [],
        overflow: options.overflow ?? false,
        evicted: options.evicted ?? null,
        cursor: options.cursor ?? null,
        calls: options.calls ?? [],
        callTrace: options.callTrace ?? '',
        cleared: options.cleared ?? [],
        trace: options.trace ?? [],
        watch: this.#watch()
      };
    }

    #newAction(kind, label, before, after) {
      return {
        id: this.#nextId++,
        kind,
        label,
        before: { text: before.text, cursor: before.cursor },
        after: { text: after.text, cursor: after.cursor }
      };
    }

    #doAction(action) {
      const trace = [['doAction', 'if (!isEmpty(&redoStack)) {']];
      const calls = [];
      const invalidated = this.#redoStack.isEmpty()
        ? []
        : this.#redoStack.toArray().reverse();
      if (invalidated.length > 0) {
        this.#redoStack.clear();
        calls.push('redo.clear()');
        trace.push(['doAction', 'clear(&redoStack);']);
      }

      trace.push(['doAction', 'if (!push(&undoStack, a)) {']);
      let overflow = false;
      let evicted = null;
      if (!this.#undoStack.push(action)) {
        overflow = true;
        trace.push(...PUSH_FULL());
        trace.push(['doAction', 'evictOldest(&undoStack);']);
        const n = this.#undoStack.size();
        const temp = new this.#StackClass(this.#capacity);

        // Match the C implementation using only push/pop through a temporary Stack.
        let moved;
        while ((moved = this.#undoStack.pop()) !== null) temp.push(moved);
        evicted = temp.pop();
        while ((moved = temp.pop()) !== null) this.#undoStack.push(moved);

        trace.push(...EVICT(n));
        calls.push(`undo.push(${action.label}) → false`);
        calls.push(`evictOldest(undo) → dropped ${evicted.label}`);
        calls.push(`undo.push(${action.label}) → ${this.#undoStack.push(action)}`);
        trace.push(['doAction', 'push(&undoStack, a);'], ...PUSH_OK());
      } else {
        calls.push(`undo.push(${action.label}) → true`);
        trace.push(...PUSH_OK());
      }

      this.#doc = action.after.text;
      trace.push(['doAction', 'strcpy(doc, a.after);']);
      return { calls, invalidated, overflow, evicted, trace };
    }

    typeWord(word, cursorBefore) {
      const trimmed = word.trim();
      if (trimmed.length === 0) {
        return this.#result('type', { ok: false, reason: 'empty-input' });
      }

      const need = this.#doc.length + (this.#doc.length > 0 ? 1 : 0) + trimmed.length;
      if (need >= History.MAX_TEXT) {
        return this.#result('type', {
          ok: false,
          reason: 'doc-full',
          callTrace: `typeWord(${JSON.stringify(trimmed)}) → false (document full)`,
          trace: [['typeWord', 'if (need >= MAX_TEXT) {'], ['typeWord', 'return false;']]
        });
      }

      const afterText = this.#doc + (this.#doc.length > 0 ? ' ' : '') + trimmed;
      const action = this.#newAction(
        'type',
        History.makeLabel('+', trimmed),
        { text: this.#doc, cursor: cursorBefore ?? this.#doc.length },
        { text: afterText, cursor: afterText.length }
      );
      const outcome = this.#doAction(action);
      const trace = [
        ['typeWord', 'if (need >= MAX_TEXT) {'],
        ['typeWord', "doAction(makeAction('+', word, after));"],
        ...outcome.trace
      ];
      const clearCall = outcome.invalidated.length ? ' → clear(&redoStack)' : '';
      const overflowCall = outcome.overflow
        ? ' → push(&undoStack, a) → false → evictOldest(&undoStack) → push(&undoStack, a) → true'
        : ' → push(&undoStack, a) → true';
      const callTrace = `typeWord(${JSON.stringify(trimmed)}) → doAction(a)${clearCall}${overflowCall}`;
      return this.#result('type', {
        action,
        invalidated: outcome.invalidated,
        overflow: outcome.overflow,
        evicted: outcome.evicted,
        cursor: action.after.cursor,
        calls: outcome.calls,
        callTrace,
        trace
      });
    }

    deleteLastWord(cursorBefore) {
      const whitespace = /[ \t\n\v\f\r]/;
      let end = this.#doc.length;
      while (end > 0 && whitespace.test(this.#doc[end - 1])) end--;
      if (end === 0) {
        return this.#result('delete', {
          ok: false,
          reason: 'nothing-to-delete',
          callTrace: 'deleteLastWord() → false',
          trace: [['deleteLastWord', 'if (end == 0) {'], ['deleteLastWord', 'return false;']]
        });
      }

      let start = end;
      while (start > 0 && !whitespace.test(this.#doc[start - 1])) start--;
      let keep = start;
      while (keep > 0 && whitespace.test(this.#doc[keep - 1])) keep--;
      const word = this.#doc.slice(start, end);
      const afterText = this.#doc.slice(0, keep);
      const action = this.#newAction(
        'delete',
        History.makeLabel('-', word),
        { text: this.#doc, cursor: cursorBefore ?? this.#doc.length },
        { text: afterText, cursor: keep }
      );
      const outcome = this.#doAction(action);
      const trace = [
        ['deleteLastWord', 'if (end == 0) {'],
        ['deleteLastWord', "doAction(makeAction('-', word, after));"],
        ...outcome.trace
      ];
      const clearCall = outcome.invalidated.length ? ' → clear(&redoStack)' : '';
      const overflowCall = outcome.overflow
        ? ' → push(&undoStack, a) → false → evictOldest(&undoStack) → push(&undoStack, a) → true'
        : ' → push(&undoStack, a) → true';
      return this.#result('delete', {
        action,
        invalidated: outcome.invalidated,
        overflow: outcome.overflow,
        evicted: outcome.evicted,
        cursor: action.after.cursor,
        calls: outcome.calls,
        callTrace: `deleteLastWord() → doAction(a)${clearCall}${overflowCall}`,
        trace
      });
    }

    commitEdit({ kind, label, before, after }) {
      if (before.text === after.text) {
        return this.#result('edit', { ok: false, reason: 'no-change' });
      }
      if (after.text.length > History.MAX_TEXT - 1) {
        return this.#result('edit', { ok: false, reason: 'doc-full' });
      }

      const action = this.#newAction(kind, label, before, after);
      const outcome = this.#doAction(action);
      const clearCall = outcome.invalidated.length ? ' → clear(&redoStack)' : '';
      const overflowCall = outcome.overflow
        ? ' → push(&undoStack, a) → false → evictOldest(&undoStack) → push(&undoStack, a) → true'
        : ' → push(&undoStack, a) → true';
      return this.#result('edit', {
        action,
        invalidated: outcome.invalidated,
        overflow: outcome.overflow,
        evicted: outcome.evicted,
        cursor: action.after.cursor,
        calls: outcome.calls,
        callTrace: `doAction(a)${clearCall}${overflowCall}`,
        trace: outcome.trace
      });
    }

    undo() {
      const trace = [['undo', 'if (!pop(&undoStack, &a)) {']];
      const action = this.#undoStack.pop();
      const calls = [`undo.pop() → ${action ? action.label : 'null'}`];
      if (action === null) {
        trace.push(...POP_EMPTY(), ['undo', 'return false;']);
        return this.#result('undo', {
          ok: false,
          reason: 'underflow',
          stack: 'undo',
          calls,
          callTrace: 'undo() → pop(&undoStack, &a) → false',
          trace
        });
      }

      trace.push(...POP_OK());
      this.#doc = action.before.text;
      trace.push(['undo', 'strcpy(doc, a.before);'], ['undo', 'push(&redoStack, a);']);
      const pushed = this.#redoStack.push(action);
      calls.push(`redo.push(${action.label}) → ${pushed}`);
      trace.push(...PUSH_OK(), ['undo', 'return true;']);
      return this.#result('undo', {
        action,
        stack: 'undo',
        cursor: action.before.cursor,
        calls,
        callTrace: `undo() → pop(&undoStack, &a) → true → push(&redoStack, a) → ${pushed}`,
        trace
      });
    }

    redo() {
      const trace = [['redo', 'if (!pop(&redoStack, &a)) {']];
      const action = this.#redoStack.pop();
      const calls = [`redo.pop() → ${action ? action.label : 'null'}`];
      if (action === null) {
        trace.push(...POP_EMPTY(), ['redo', 'return false;']);
        return this.#result('redo', {
          ok: false,
          reason: 'underflow',
          stack: 'redo',
          calls,
          callTrace: 'redo() → pop(&redoStack, &a) → false',
          trace
        });
      }

      trace.push(...POP_OK());
      this.#doc = action.after.text;
      trace.push(['redo', 'strcpy(doc, a.after);'], ['redo', 'push(&undoStack, a);']);
      const pushed = this.#undoStack.push(action);
      calls.push(`undo.push(${action.label}) → ${pushed}`);
      trace.push(...PUSH_OK(), ['redo', 'return true;']);
      return this.#result('redo', {
        action,
        stack: 'redo',
        cursor: action.after.cursor,
        calls,
        callTrace: `redo() → pop(&redoStack, &a) → true → push(&undoStack, a) → ${pushed}`,
        trace
      });
    }

    peek(which) {
      if (which !== 'undo' && which !== 'redo') {
        throw new RangeError("which must be 'undo' or 'redo'");
      }
      const stack = which === 'undo' ? this.#undoStack : this.#redoStack;
      const cName = which === 'undo' ? '&undoStack' : '&redoStack';
      const action = stack.peek();
      const calls = [`${which}.peek() → ${action ? action.label : 'null'}`];
      const trace = [['peek', 'if (isEmpty(s)) {']];
      trace.push(action ? ['peek', 'return &s->items[s->top];'] : ['peek', 'return NULL;']);
      return this.#result('peek', {
        action,
        stack: which,
        calls,
        callTrace: `peek(${cName}) → ${action ? action.label : 'NULL'}`,
        trace
      });
    }

    clearStack(which) {
      if (which !== 'undo' && which !== 'redo') {
        throw new RangeError("which must be 'undo' or 'redo'");
      }
      const stack = which === 'undo' ? this.#undoStack : this.#redoStack;
      const cName = which === 'undo' ? '&undoStack' : '&redoStack';
      const cleared = stack.toArray().reverse();
      stack.clear();
      return this.#result('clear', {
        stack: which,
        cleared,
        calls: [`${which}.clear()`],
        callTrace: `clear(${cName}) → top = -1`,
        trace: [['clear', '{ s->top = -1; }']]
      });
    }

    setCapacity(n) {
      if (![3, 4, 5, 6].includes(n)) {
        throw new RangeError('History capacity must be 3, 4, 5, or 6');
      }
      this.#undoStack = new this.#StackClass(n);
      this.#redoStack = new this.#StackClass(n);
      this.#capacity = n;
      return this.#result('capacity', {
        calls: [`new Stack(${n}) ×2`],
        callTrace: `init(&undoStack, ${n}) → init(&redoStack, ${n})`,
        trace: [
          ['init', 's->top = -1;'],
          ['init', 's->capacity = capacity;'],
          ['init', 's->top = -1;'],
          ['init', 's->capacity = capacity;']
        ]
      });
    }
  }

  History.MAX_TEXT = 256;
  History.ANCHORS = ANCHORS;
  globalThis.History = History;
})();
