(() => {
  'use strict';

  const start = () => {
    const HistoryModel = globalThis.History;
    const CodePanel = globalThis.CodePanel;
    const source = globalThis.C_SOURCE;
    const Tour = globalThis.Tour;
    if (Tour) Tour.init({
      seenKey: 'dsa-sims-tour-seen',
      steps: [
        { sel: '#editor', title: 'TEXT BOX', text: 'Type freely. Each finished word is pushed onto the Undo Stack as one block.' },
        { sel: '#word-input', title: 'WORD + TYPE', text: 'Enter a word, press TYPE: one action, one push().' },
        { sel: '#btn-delete', title: 'DELETE', text: 'Removes the last word. Deleting is an action too, so it is pushed.' },
        { sel: '#btn-undo', title: 'UNDO', text: 'pop() the top Undo block and push it onto Redo. Last in, first out.' },
        { sel: '#btn-redo', title: 'REDO', text: 'pop() the top Redo block and push it back onto Undo.' },
        { sel: '#undo-stack', title: 'UNDO STACK', text: 'Your history. The TOP block is the next one undone. Max 6 blocks.' },
        { sel: '#redo-stack', title: 'REDO STACK', text: 'What you undid. Any new action clears it.' },
        { sel: '#undo-stack .btn-peek', title: 'PEEK', text: 'peek(): see the top block without removing it.' },
        { sel: '#undo-stack .btn-clear', title: 'CLEAR', text: 'clear(): empty this stack at once (top = -1). Your text stays.' },
        { sel: '#settings > summary', title: 'SETTINGS', text: 'Word or keystroke grouping, max history (3–6), callouts on/off.' },
        { sel: '#code-panel .code-panel__scroll', title: 'C CODE', text: 'The same algorithm in C. The running line lights up on every click.' },
        { sel: '#log-panel, #tab-log', title: 'LOG', text: 'Every stack call with its return value, newest first.' },
        { sel: '#tour-start', title: 'TIPS', text: 'Replay this tour anytime.' },
      ],
    });

    if (!HistoryModel || !CodePanel || typeof source !== 'string') return;

    const byId = (id) => document.getElementById(id);
    const el = {
      editor: byId('editor'),
      docCount: byId('doc-count'),
      settings: byId('settings'),
      controls: byId('controls'),
      wordInput: byId('word-input'),
      type: byId('btn-type'),
      delete: byId('btn-delete'),
      undo: byId('btn-undo'),
      redo: byId('btn-redo'),
      bubble: byId('bubble'),
      bubbleText: null,
      banner: byId('banner'),
      undoPanel: byId('undo-stack'),
      redoPanel: byId('redo-stack'),
      log: byId('log'),
      capacity: byId('max-history'),
      callouts: Array.from(document.querySelectorAll('input[name="callouts"]')),
      panels: document.querySelector('.sim__panels'),
      tabCode: byId('tab-code'),
      tabLog: byId('tab-log'),
      codePanel: byId('code-panel'),
      granularity: Array.from(document.querySelectorAll('input[name="granularity"]')),
    };
    el.bubbleText = el.bubble?.querySelector('.bubble__text') || null;

    if (!el.editor || !el.controls || !el.undoPanel || !el.redoPanel || !el.log) return;

    const model = new HistoryModel({ capacity: 6 });
    const panel = CodePanel.mount(el.codePanel, {
      source,
      anchors: HistoryModel.ANCHORS,
      title: 'UNDO_REDO.C',
      filename: 'undo_redo.c',
      sections: ['DATA', 'STACK OPS', 'UNDO/REDO', 'HELPERS', 'MAIN'],
      types: ['Action', 'Stack'],
      formatWatch(w) {
        let doc = String(w.doc == null ? '' : w.doc);
        if (doc.length > 40) doc = doc.slice(0, 40) + '\u2026';
        return 'undoStack.top = ' + w.undoTop + ' \u00B7 redoStack.top = ' + w.redoTop + ' \u00B7 capacity = ' + w.capacity + ' \u00B7 doc = ' + String.fromCharCode(34) + doc + String.fromCharCode(34);
      },
    });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const running = new Set();
    const clearButtons = [...document.querySelectorAll('.btn-clear')];
    // Free typing: how long a pause must last before the word in progress is
    // registered as a block on the Undo Stack (word boundaries still commit at once).
    const IDLE_COMMIT_MS = 1500;
    const timers = new Set();
    const activePeekBlocks = new Set();
    let operationNumber = 0;
    let runNumber = 0;
    let bubbleTimer = 0;
    let bubbleTransitionTimer = 0;
    let pending = null;
    let pendingTimer = 0;
    let programmatic = false;
    let committed = model.doc;
    let liveText = el.editor.value;
    let lastSelection = [el.editor.selectionStart, el.editor.selectionEnd];
    let pushTips = 0;
    let popTips = 0;
    let overflowStampUntil = 0;

    const stackInfo = {
      undo: {
        panel: el.undoPanel,
        well: el.undoPanel.querySelector('.stack__well'),
        size: el.undoPanel.querySelector('.stack__size'),
        top: el.undoPanel.querySelector('.stack__top'),
        stamp: el.undoPanel.querySelector('.stack__stamp'),
      },
      redo: {
        panel: el.redoPanel,
        well: el.redoPanel.querySelector('.stack__well'),
        size: el.redoPanel.querySelector('.stack__size'),
        top: el.redoPanel.querySelector('.stack__top'),
        stamp: el.redoPanel.querySelector('.stack__stamp'),
      },
    };

    const getStack = (which) => which === 'undo' ? model.undoStack : model.redoStack;
    const isCWhitespaceOnly = (text) => /^[ \t\n\v\f\r]*$/.test(text);
    const setTimeoutTracked = (fn, delay) => {
      const id = window.setTimeout(() => {
        timers.delete(id);
        fn();
      }, delay);
      timers.add(id);
      return id;
    };

    const animate = (node, keyframes, options) => {
      if (!node || reduceMotion.matches || typeof node.animate !== 'function') return null;
      try {
        const animation = node.animate(keyframes, options);
        running.add(animation);
        animation.finished.then(
          () => running.delete(animation),
          () => running.delete(animation),
        );
        return animation;
      } catch (_) {
        return null;
      }
    };

    const waitFor = (animations) => Promise.all(animations.filter(Boolean).map((animation) =>
      animation.finished.catch(() => undefined)));

    const clearBubble = () => {
      if (bubbleTimer) window.clearTimeout(bubbleTimer);
      bubbleTimer = 0;
      if (!el.bubble) return;
      el.bubble.classList.remove('is-visible');
      if (bubbleTransitionTimer) window.clearTimeout(bubbleTransitionTimer);
      bubbleTransitionTimer = window.setTimeout(() => {
        bubbleTransitionTimer = 0;
        if (!el.bubble.classList.contains('is-visible')) el.bubble.hidden = true;
      }, reduceMotion.matches ? 0 : 220);
    };

    const calloutsOff = () => el.callouts.some((radio) => radio.checked && radio.value === 'off');
    const showBubble = (text, duration = 4000) => {
      if (!el.bubble || !el.bubbleText || calloutsOff()) return;
      if (bubbleTimer) window.clearTimeout(bubbleTimer);
      if (bubbleTransitionTimer) window.clearTimeout(bubbleTransitionTimer);
      bubbleTransitionTimer = 0;
      el.bubbleText.textContent = text;
      el.bubble.hidden = false;
      requestAnimationFrame(() => el.bubble.classList.add('is-visible'));
      bubbleTimer = window.setTimeout(clearBubble, duration);
    };

    const finishAll = () => {
      runNumber += 1;
      running.forEach((animation) => {
        try { animation.finish(); } catch (_) { /* already finished */ }
      });
      running.clear();
      timers.forEach((id) => window.clearTimeout(id));
      timers.clear();
      overflowStampUntil = 0;
      activePeekBlocks.forEach((block) => block.classList.remove('is-peek'));
      activePeekBlocks.clear();
      if (el.banner) el.banner.hidden = true;
      const overflowStamp = stackInfo.undo.stamp;
      if (overflowStamp) {
        overflowStamp.textContent = 'FULL';
        overflowStamp.hidden = !model.undoStack.isFull();
      }
      if (panel && typeof panel.skip === 'function') panel.skip();
    };

    const textQuote = (text) => `"${text}"`;
    const makeBlock = (action, which, index, isTop) => {
      const item = document.createElement('li');
      item.className = `block block--${which}${isTop ? ' is-top' : ''}`;
      item.dataset.id = String(action.id);
      item.tabIndex = 0;
      item.title = `${textQuote(action.before.text)} → ${textQuote(action.after.text)}`;

      const blockIndex = document.createElement('span');
      blockIndex.className = 'block__index';
      blockIndex.textContent = `[${index}]`;
      const label = document.createElement('span');
      label.className = 'block__label';
      label.textContent = action.label;
      item.append(blockIndex, label);
      if (isTop) {
        const tag = document.createElement('span');
        tag.className = 'block__tag';
        tag.textContent = 'TOP';
        item.append(tag);
      }
      return item;
    };

    const renderStack = (which) => {
      const stack = getStack(which);
      const info = stackInfo[which];
      const actions = stack.toArray();
      if (!info.well) return;
      const fragment = document.createDocumentFragment();
      for (let index = 0; index < stack.capacity; index += 1) {
        if (index < actions.length) {
          fragment.append(makeBlock(actions[index], which, index, index === actions.length - 1));
        } else {
          const slot = document.createElement('li');
          slot.className = 'slot';
          const slotIndex = document.createElement('span');
          slotIndex.className = 'block__index';
          slotIndex.textContent = `[${index}]`;
          slot.append(slotIndex);
          fragment.append(slot);
        }
      }
      info.well.replaceChildren(fragment);
    };

    const updateWatch = () => {
      const undo = model.undoStack;
      const redo = model.redoStack;
      const watch = {
        undoTop: undo.top,
        redoTop: redo.top,
        capacity: model.capacity,
        doc: model.doc,
      };
      if (panel && typeof panel.setWatch === 'function') panel.setWatch(watch);
      return watch;
    };

    const updateStackMeta = (which) => {
      const stack = getStack(which);
      const root = stackInfo[which].panel;
      if (!root) return;
      root.dataset.cap = String(stack.capacity);
      root.classList.toggle('is-full', stack.isFull());
      const { size, top, stamp } = stackInfo[which];
      if (size) size.textContent = `${stack.size()} / ${stack.capacity}`;
      if (top) top.textContent = `top = ${stack.top}`;
      if (stamp) {
        stamp.textContent = which === 'undo' && Date.now() < overflowStampUntil ? 'STACK OVERFLOW' : 'FULL';
        stamp.hidden = !stack.isFull();
      }
    };

    const updateButtons = () => {
      const undoTop = model.undoStack.peek();
      const redoTop = model.redoStack.peek();
      if (el.undo) {
        el.undo.disabled = model.undoStack.isEmpty();
        el.undo.title = undoTop ? `Undo: ${undoTop.label}` : 'Undo';
      }
      if (el.redo) {
        el.redo.disabled = model.redoStack.isEmpty();
        el.redo.title = redoTop ? `Redo: ${redoTop.label}` : 'Redo';
      }
      if (el.delete) el.delete.disabled = isCWhitespaceOnly(model.doc);
      if (el.type) el.type.disabled = !el.wordInput || !el.wordInput.value.trim();
      if (el.docCount) el.docCount.textContent = `${model.doc.length} / 255`;
      clearButtons.forEach((button) => { button.disabled = getStack(button.dataset.stack).isEmpty(); });
      updateStackMeta('undo');
      updateStackMeta('redo');
    };

    const renderAll = () => {
      renderStack('undo');
      renderStack('redo');
      updateButtons();
      updateWatch();
    };

    const showBanner = (text) => {
      if (!el.banner) return;
      el.banner.textContent = text;
      el.banner.hidden = false;
      setTimeoutTracked(() => { el.banner.hidden = true; }, 2500);
    };

    const showOverflowStamp = () => {
      const stamp = stackInfo.undo.stamp;
      if (!stamp) return;
      overflowStampUntil = Date.now() + 1500;
      stamp.textContent = 'STACK OVERFLOW';
      stamp.hidden = false;
      setTimeoutTracked(() => {
        overflowStampUntil = 0;
        if (model.undoStack.isFull()) {
          stamp.textContent = 'FULL';
          stamp.hidden = false;
        } else {
          stamp.hidden = true;
        }
      }, 1500);
    };

    const animateShake = (node, duration = 350) => animate(node, [
      { transform: 'translateX(0)' },
      { transform: 'translateX(-8px)' },
      { transform: 'translateX(8px)' },
      { transform: 'translateX(-6px)' },
      { transform: 'translateX(6px)' },
      { transform: 'translateX(0)' },
    ], { duration, easing: 'ease-in-out' });

    const animateOperation = async (result, token) => {
      if (result.invalidated?.length) showBanner('REDO HISTORY DISCARDED: YOU BRANCHED TO A NEW FUTURE.');
      if (result.overflow && result.evicted) showOverflowStamp();
      if (reduceMotion.matches) {
        renderAll();
        return;
      }
      const easeOut = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim() || 'cubic-bezier(.16,1,.3,1)';
      const easeExpo = 'cubic-bezier(.19,1,.22,1)';
      const pushOp = ['type', 'delete', 'edit'].includes(result.op) && result.ok;
      const moveOp = (result.op === 'undo' || result.op === 'redo') && result.ok && result.action;

      if (result.invalidated?.length) {
        const oldBlocks = result.invalidated.map((action) => stackInfo.redo.well?.querySelector(`[data-id="${action.id}"]`)).filter(Boolean);
        const flights = oldBlocks.map((block, index) => animate(block, [
          { transform: 'translateX(0) rotate(0deg)', opacity: 1 },
          { transform: 'translateX(60%) rotate(12deg)', opacity: 0 },
        ], { duration: 250, delay: index * 80, easing: easeOut, fill: 'forwards' }));
        await waitFor(flights);
        if (token !== runNumber) return;
        renderStack('redo');
      }

      if (result.op === 'clear' && result.cleared.length) {
        const well = stackInfo[result.stack].well;
        const blocks = result.cleared.map((action) => well?.querySelector(`[data-id="${action.id}"]`)).filter(Boolean);
        const sweeps = blocks.map((block, index) => animate(block, [
          { transform: 'translateY(0) rotate(0deg) scale(1)', opacity: 1 },
          { transform: 'translateY(-35%) rotate(-10deg) scale(.85)', opacity: 0 },
        ], { duration: 250, delay: index * 80, easing: easeOut, fill: 'forwards' }));
        await waitFor(sweeps);
        if (token !== runNumber) return;
      }

      if (result.overflow && result.evicted) {
        const stackNode = el.undoPanel;
        const oldBlock = stackInfo.undo.well?.querySelector(`[data-id="${result.evicted.id}"]`);
        animateShake(stackNode);
        if (oldBlock) {
          const drop = animate(oldBlock, [
            { transform: 'translateY(0)', opacity: 1 },
            { transform: 'translateY(120%)', opacity: 0 },
          ], { duration: 300, easing: easeOut, fill: 'forwards' });
          await waitFor([drop]);
          if (token !== runNumber) return;
        }
      }

      if (moveOp) {
        const from = result.op === 'undo' ? 'undo' : 'redo';
        const to = result.op === 'undo' ? 'redo' : 'undo';
        const source = stackInfo[from].well?.querySelector(`[data-id="${result.action.id}"]`);
        const sourceRect = source?.getBoundingClientRect();
        const fromColor = source ? getComputedStyle(source).backgroundColor : '';
        renderAll();
        const destination = stackInfo[to].well?.querySelector(`[data-id="${result.action.id}"]`);
        const destRect = destination?.getBoundingClientRect();
        if (destination && sourceRect && destRect) {
          // Fly a clone on a fixed top layer: the real block lives inside a clipped
          // .stack, so animating it directly would slide it behind the stack outlines.
          const flyer = destination.cloneNode(true);
          flyer.removeAttribute('tabindex');
          flyer.removeAttribute('title');
          flyer.setAttribute('aria-hidden', 'true');
          flyer.classList.add('block--flying');
          flyer.style.left = `${destRect.left}px`;
          flyer.style.top = `${destRect.top}px`;
          flyer.style.width = `${destRect.width}px`;
          flyer.style.height = `${destRect.height}px`;
          document.body.appendChild(flyer);
          const toColor = getComputedStyle(destination).backgroundColor;
          const dx = sourceRect.left - destRect.left;
          const dy = sourceRect.top - destRect.top;
          const flight = animate(flyer, [
            { transform: `translate(${dx}px, ${dy}px)`, backgroundColor: fromColor || toColor, offset: 0 },
            { transform: `translate(${dx / 2}px, ${dy / 2 - 40}px) scale(1.06)`, offset: 0.5 },
            { transform: 'translate(0, 0)', backgroundColor: toColor, offset: 1 },
          ], { duration: 400, easing: easeExpo });
          if (flight) {
            destination.style.visibility = 'hidden';
            const land = () => {
              flyer.remove();
              destination.style.visibility = '';
            };
            flight.finished.then(land, land);
          } else {
            flyer.remove();
          }
        }
        if (el.editor) animate(el.editor, [
          { backgroundColor: 'var(--lime)' },
          { backgroundColor: '#fff' },
        ], { duration: 500, easing: easeOut });
        return;
      }

      if (result.op === 'undo' && !result.ok || result.op === 'redo' && !result.ok) {
        const which = result.op;
        const stackNode = stackInfo[which].panel;
        animate(stackNode, [
          { transform: 'rotate(0deg)' },
          { transform: 'rotate(-2deg)' },
          { transform: 'rotate(2deg)' },
          { transform: 'rotate(-1deg)' },
          { transform: 'rotate(0deg)' },
        ], { duration: 400, easing: 'ease-in-out' });
      }

      if (result.op === 'peek' && result.ok && result.action) {
        renderAll();
        const peeked = stackInfo[result.stack].well?.querySelector(`[data-id="${result.action.id}"]`);
        if (peeked) {
          peeked.classList.add('is-peek');
          animate(peeked, [
            { transform: 'translateY(0)' },
            { transform: 'translateY(-6px)' },
            { transform: 'translateY(0)' },
            { transform: 'translateY(-6px)' },
            { transform: 'translateY(0)' },
          ], { duration: 1000, iterations: 1, easing: easeOut });
          activePeekBlocks.add(peeked);
          setTimeoutTracked(() => {
            peeked.classList.remove('is-peek');
            activePeekBlocks.delete(peeked);
          }, 1500);
        }
        const size = stackInfo[result.stack].size;
        if (size) animate(size, [
          { transform: 'scale(1)' },
          { transform: 'scale(1.15)' },
          { transform: 'scale(1)' },
        ], { duration: 500, iterations: 2, easing: easeOut });
      }

      renderAll();
      if (pushOp && result.action) {
        const newBlock = stackInfo.undo.well?.querySelector(`[data-id="${result.action.id}"]`);
        animate(newBlock, [
          { transform: 'translateY(-120%)', opacity: 0 },
          { transform: 'translateY(0)', opacity: 1 },
        ], { duration: 300, easing: easeOut });
      }
    };

    const displayCallout = (result) => {
      if (!result.ok) {
        if (result.reason === 'empty-input') showBubble('Type a word first.');
        else if (result.reason === 'doc-full') showBubble('Document full: 255 characters, the size of char doc[256] in C.');
        else if (result.reason === 'underflow') {
          showBubble(`Stack Underflow! pop() on an empty stack returned null. Nothing to ${result.op === 'redo' ? 'redo' : 'undo'}.`);
        } else if (result.reason === 'nothing-to-delete') showBubble('There is nothing to delete.');
        return;
      }

      if (result.op === 'capacity') {
        showBubble(`History reset: capacity is now ${model.capacity}.`);
      } else if (result.op === 'clear') {
        const count = result.cleared.length;
        if (!count) showBubble(`clear(): the ${result.stack} stack is already empty (top = -1).`);
        else if (result.stack === 'undo') showBubble(`clear(&undoStack) set top = -1: ${count} undo step${count === 1 ? '' : 's'} gone. The text stays, but you can no longer undo it.`);
        else showBubble(`clear(&redoStack) set top = -1: ${count} redo step${count === 1 ? '' : 's'} gone. Nothing left to redo.`);
      } else if (result.op === 'peek') {
        if (!result.action) showBubble('peek() → null: the stack is empty.');
        else showBubble(`peek() → ${result.action.label}. You looked at the top without removing it. Size is still ${getStack(result.stack).size()}.`);
      } else if (result.op === 'undo' && result.action) {
        popTips += 1;
        if (popTips <= 3) showBubble(`pop() always takes the TOP block: ${result.action.label}. Last In, First Out. It moves to the Redo Stack.`);
      } else if (result.op === 'redo') {
        showBubble('Redo pops from the Redo Stack, also LIFO, so the last thing you undid comes back first.');
      } else if (['type', 'delete', 'edit'].includes(result.op)) {
        pushTips += 1;
        if (result.invalidated?.length) {
          showBubble('You typed something new after undoing, so the old redo history no longer matches your document. redo.clear().');
        } else if (result.overflow && result.evicted) {
          showBubble(`Stack Overflow! push() returned false: the stack is full (${model.capacity}/${model.capacity}). The oldest action ${result.evicted.label} is forgotten for good. That's why real editors have a history limit.`);
        } else {
          if (pushTips <= 3) showBubble(`push(): new block on top! Undo Stack size is now ${model.undoStack.size()}.`);
        }
      }
    };

    const updateTextAndCaret = (result) => {
      const value = model.doc;
      const caret = Number.isFinite(result.cursor) ? result.cursor : value.length;
      if (el.editor.value !== value) {
        programmatic = true;
        el.editor.value = value;
        programmatic = false;
      }
      try { el.editor.setSelectionRange(Math.min(caret, value.length), Math.min(caret, value.length)); } catch (_) { /* unsupported input type */ }
      liveText = value;
      committed = value;
      lastSelection = [el.editor.selectionStart, el.editor.selectionEnd];
    };

    const operationLabel = (op) => ({
      type: 'TYPE', delete: 'DELETE', edit: 'EDIT', undo: 'UNDO', redo: 'REDO', peek: 'PEEK', clear: 'CLEAR', capacity: 'CAPACITY',
    })[op] || String(op).toUpperCase();

    const appendLog = (result) => {
      if (!el.log) return;
      operationNumber += 1;
      const line = document.createElement('li');
      line.className = 'log__line';
      if (!result.ok || result.overflow) line.classList.add('is-error');
      const undoSize = result.watch.undoTop + 1;
      const redoSize = result.watch.redoTop + 1;
      line.textContent = `#${operationNumber} ${operationLabel(result.op)}  ${result.calls.join('   ')}   undo ${undoSize} · redo ${redoSize}`;
      el.log.prepend(line);
      while (el.log.children.length > 100) el.log.lastElementChild.remove();
    };

    const apply = (result) => {
      if (!result || result.reason === 'no-change') return Promise.resolve();
      finishAll();
      const token = runNumber;
      if (result.reason === 'empty-input' || result.reason === 'doc-full') {
        animateShake(el.wordInput, 300);
      }
      if (result.op !== 'peek' && result.op !== 'capacity' && result.op !== 'clear') updateTextAndCaret(result);
      else {
        committed = model.doc;
        liveText = el.editor.value;
      }
      updateButtons();
      displayCallout(result);
      if (panel && typeof panel.play === 'function') panel.play(result);
      appendLog(result);
      return animateOperation(result, token);
    };

    const hideBubble = () => clearBubble();
    el.bubble?.addEventListener('click', hideBubble);

    const showBlockDetails = (block) => {
      const which = block.classList.contains('block--undo') ? 'undo' : 'redo';
      const action = getStack(which).toArray().find((item) => String(item.id) === block.dataset.id);
      if (!action) return;
      showBubble(`${action.label}: ${textQuote(action.before.text)} → ${textQuote(action.after.text)}`, 4000);
    };

    [stackInfo.undo.well, stackInfo.redo.well].forEach((well) => {
      well?.addEventListener('click', (event) => {
        const block = event.target.closest('.block');
        if (block && well.contains(block)) showBlockDetails(block);
      });
      well?.addEventListener('keydown', (event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        const block = event.target.closest('.block');
        if (!block || !well.contains(block)) return;
        event.preventDefault();
        showBlockDetails(block);
      });
    });

    const typeFromInput = () => {
      flushPending();
      const text = el.wordInput?.value || '';
      const result = model.typeWord(text, el.editor.selectionStart);
      if (result.ok && el.wordInput) el.wordInput.value = '';
      apply(result);
      updateButtons();
      el.wordInput?.focus();
    };

    el.type?.addEventListener('click', typeFromInput);
    el.wordInput?.addEventListener('input', updateButtons);
    el.wordInput?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        typeFromInput();
      }
    });

    el.delete?.addEventListener('click', () => {
      flushPending();
      apply(model.deleteLastWord(el.editor.selectionStart));
    });
    el.undo?.addEventListener('click', () => {
      flushPending();
      apply(model.undo());
    });
    el.redo?.addEventListener('click', () => {
      flushPending();
      apply(model.redo());
    });

    document.querySelectorAll('.btn-peek').forEach((button) => {
      button.addEventListener('click', () => {
        flushPending();
        apply(model.peek(button.dataset.stack));
      });
    });

    clearButtons.forEach((button) => {
      button.addEventListener('click', () => {
        flushPending();
        apply(model.clearStack(button.dataset.stack));
      });
    });

    el.capacity?.addEventListener('change', () => {
      flushPending();
      apply(model.setCapacity(Number(el.capacity.value)));
    });

    el.callouts.forEach((radio) => radio.addEventListener('change', () => {
      if (!calloutsOff()) return;
      if (bubbleTimer) window.clearTimeout(bubbleTimer);
      if (bubbleTransitionTimer) window.clearTimeout(bubbleTransitionTimer);
      bubbleTimer = 0;
      bubbleTransitionTimer = 0;
      el.bubble?.classList.remove('is-visible');
      if (el.bubble) el.bubble.hidden = true;
    }));

    const setTab = (tab) => {
      if (!el.panels) return;
      el.panels.dataset.tab = tab;
      [[el.tabCode, tab === 'code'], [el.tabLog, tab === 'log']].forEach(([button, selected]) => {
        if (button) button.setAttribute('aria-selected', String(selected));
      });
    };
    [[el.tabCode, 'code'], [el.tabLog, 'log']].forEach(([button, tab]) => button?.addEventListener('click', () => {
      flushPending();
      setTab(tab);
    }));
    [el.tabCode, el.tabLog].forEach((button) => button?.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      flushPending();
      const nextTab = button === el.tabCode ? 'log' : 'code';
      setTab(nextTab);
      (nextTab === 'code' ? el.tabCode : el.tabLog)?.focus();
    }));

    el.granularity.forEach((radio) => radio.addEventListener('change', () => flushPending()));

    const granularity = () => el.granularity.find((radio) => radio.checked)?.value || 'word';
    const cancelPendingTimer = () => {
      if (pendingTimer) window.clearTimeout(pendingTimer);
      pendingTimer = 0;
    };

    const commonDiff = (before, after) => {
      let prefix = 0;
      while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
      let suffix = 0;
      while (suffix < before.length - prefix && suffix < after.length - prefix &&
        before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
      return {
        oldText: before.slice(prefix, before.length - suffix),
        newText: after.slice(prefix, after.length - suffix),
      };
    };

    const labelText = (text) => {
      const trimmed = text.trim();
      if (trimmed) return trimmed;
      return text.replace(/\r\n|\s/gu, (whitespace) => ({
        ' ': '␣', '\t': '⇥', '\n': '↵', '\r\n': '↵', '\r': '↵', '\v': '␋', '\f': '␌',
      })[whitespace] || '␣');
    };

    const flushPending = (finalText = null, finalCursor = null) => {
      cancelPendingTimer();
      if (!pending) return null;
      const burst = pending;
      pending = null;
      const afterText = finalText == null ? burst.lastText : finalText;
      const cursor = finalCursor == null ? burst.lastCursor : finalCursor;
      const diff = commonDiff(burst.startText, afterText);
      let label;
      if (burst.kind === 'replace') label = HistoryModel.makeReplaceLabel(labelText(diff.oldText), labelText(diff.newText));
      else if (burst.kind === 'delete' || burst.kind === 'cut') label = HistoryModel.makeLabel('-', labelText(diff.oldText));
      else label = HistoryModel.makeLabel('+', labelText(diff.newText));
      const result = model.commitEdit({
        kind: burst.kind,
        label,
        before: { text: burst.startText, cursor: burst.startCursor },
        after: { text: afterText, cursor },
      });
      committed = model.doc;
      if (result.reason !== 'no-change') apply(result);
      return result;
    };

    const flushPendingPreservingCaret = () => {
      const start = el.editor.selectionStart;
      const end = el.editor.selectionEnd;
      const value = el.editor.value;
      const result = flushPending();
      if (el.editor.value === value) {
        try { el.editor.setSelectionRange(start, end); } catch (_) { /* unsupported input type */ }
      }
      lastSelection = [el.editor.selectionStart, el.editor.selectionEnd];
      return result;
    };

    const classifyInput = (event, snapshot) => {
      const type = event.inputType || '';
      if (type === 'insertFromPaste' || type === 'insertFromDrop') return { kind: 'paste', immediate: true };
      if (type === 'deleteByCut') return { kind: 'cut', immediate: true };
      if (/^deleteContent/.test(type)) return { kind: 'delete', immediate: false };
      if (/^insert/.test(type) && snapshot.end > snapshot.start) {
        return { kind: 'replace', immediate: true };
      }
      if (type === 'insertText' || type === 'insertLineBreak') return { kind: 'type', immediate: false };
      return { kind: 'type', immediate: false };
    };

    let beforeInput = null;
    el.editor.addEventListener('beforeinput', (event) => {
      if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
        event.preventDefault();
        flushPending();
        apply(event.inputType === 'historyUndo' ? model.undo() : model.redo());
        return;
      }
      beforeInput = {
        value: el.editor.value,
        start: el.editor.selectionStart,
        end: el.editor.selectionEnd,
        inputType: event.inputType,
      };
    });

    el.editor.addEventListener('input', (event) => {
      if (programmatic) return;
      const current = el.editor.value;
      const selectionStart = el.editor.selectionStart;
      const selectionEnd = el.editor.selectionEnd;
      const snapshot = beforeInput || {
        value: liveText,
        start: lastSelection[0],
        end: lastSelection[1],
        inputType: event.inputType,
      };
      beforeInput = null;
      const classified = classifyInput(event, snapshot);
      if (pending && pending.kind !== classified.kind) {
        flushPending(snapshot.value, snapshot.start);
        programmatic = true;
        el.editor.value = current;
        try { el.editor.setSelectionRange(selectionStart, selectionEnd); } catch (_) { /* unsupported input type */ }
        programmatic = false;
        liveText = current;
        lastSelection = [selectionStart, selectionEnd];
      }

      if (!pending) {
        pending = {
          kind: classified.kind,
          startText: snapshot.value,
          startCursor: snapshot.start,
          lastText: current,
          lastCursor: selectionEnd,
        };
      } else {
        pending.lastText = current;
        pending.lastCursor = selectionEnd;
      }
      liveText = current;
      lastSelection = [selectionStart, selectionEnd];

      if (classified.immediate || granularity() === 'keystroke' ||
        (classified.kind === 'type' && /[\s.,!?]/u.test(current.slice(snapshot.start, selectionEnd)))) {
        flushPending(current, selectionEnd);
      } else {
        cancelPendingTimer();
        pendingTimer = window.setTimeout(() => flushPending(), IDLE_COMMIT_MS);
      }
    });

    el.editor.addEventListener('click', () => {
      if (pending && (el.editor.selectionStart !== lastSelection[0] || el.editor.selectionEnd !== lastSelection[1])) flushPendingPreservingCaret();
      lastSelection = [el.editor.selectionStart, el.editor.selectionEnd];
    });
    el.editor.addEventListener('mouseup', flushPendingPreservingCaret);
    el.editor.addEventListener('keyup', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) flushPendingPreservingCaret();
      lastSelection = [el.editor.selectionStart, el.editor.selectionEnd];
    });
    document.addEventListener('selectionchange', () => {
      if (document.activeElement !== el.editor || !pending) return;
      const start = el.editor.selectionStart;
      const end = el.editor.selectionEnd;
      if (start !== lastSelection[0] || end !== lastSelection[1]) {
        flushPendingPreservingCaret();
        lastSelection = [start, end];
      }
    });

    document.addEventListener('keydown', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' || key === 'y') {
        event.preventDefault();
        flushPending();
        if (key === 'y' || (key === 'z' && event.shiftKey)) apply(model.redo());
        else apply(model.undo());
      }
    });

    if (el.settings) {
      const summary = el.settings.querySelector('summary');
      document.addEventListener('click', (event) => {
        if (el.settings.open && !el.settings.contains(event.target)) el.settings.open = false;
      });
      el.settings.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !el.settings.open) return;
        el.settings.open = false;
        if (summary) summary.focus();
      });
    }

    const measureControls = () => {
      document.documentElement.style.setProperty('--bar-h', `${el.controls.getBoundingClientRect().height}px`);
    };
    if (typeof ResizeObserver === 'function') new ResizeObserver(measureControls).observe(el.controls);
    else window.addEventListener('resize', measureControls);
    measureControls();

    if (el.capacity) el.capacity.value = String(model.capacity);
    if (el.panels) setTab(el.panels.dataset.tab || 'code');
    el.editor.value = model.doc;
    liveText = model.doc;
    committed = model.doc;
    renderAll();
    updateWatch();
    updateButtons();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
