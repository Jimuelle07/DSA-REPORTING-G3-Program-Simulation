(() => {
  'use strict';

  const start = () => {
    const DriveThru = globalThis.DriveThru;
    const CodePanel = globalThis.CodePanel;
    const Tour = globalThis.Tour;
    const source = globalThis.C_SOURCE;
    if (!DriveThru || !CodePanel || typeof source !== 'string') return;

    const byId = (id) => document.getElementById(id);
    const el = {
      settings: byId('settings'),
      laneSize: byId('lane-size'),
      modeStraight: byId('mode-straight'),
      modeRing: byId('mode-ring'),
      lanePanel: byId('lane-panel'),
      straightLane: byId('straight-lane'),
      ringLane: byId('ring-lane'),
      straightIndices: byId('straight-indices'),
      straightTrack: byId('straight-track'),
      straightPointers: byId('straight-pointers'),
      straightWatch: byId('straight-watch'),
      ringTrack: byId('ring-track'),
      ringWatch: byId('ring-watch'),
      ringFormula: byId('ring-formula'),
      laneSizeReadout: byId('lane-size-readout'),
      fullStamp: byId('full-stamp'),
      turnedAway: byId('turned-away'),
      pickupLight: byId('pickup-light'),
      gateArm: document.querySelector('.gate-arm'),
      pickupBooth: document.querySelector('.pickup-booth'),
      overflowStamp: byId('overflow-stamp'),
      noCutting: byId('no-cutting'),
      wrapBadge: byId('wrap-badge'),
      laneStatus: byId('lane-status'),
      menuChips: byId('menu-chips'),
      arrive: byId('btn-arrive'),
      serve: byId('btn-serve'),
      peek: byId('btn-peek'),
      peekMobile: byId('btn-peek-mobile'),
      clear: byId('btn-clear'),
      kitchen: byId('kitchen'),
      kitchenState: byId('kitchen-state'),
      nowCooking: byId('now-cooking'),
      cookProgress: byId('cook-progress-fill'),
      cookStatus: byId('cook-status'),
      ticketRail: byId('ticket-rail'),
      bubble: byId('bubble'),
      bubbleText: document.querySelector('#bubble .bubble__text'),
      panels: document.querySelector('.queue-panels'),
      tabCode: byId('tab-code'),
      tabLog: byId('tab-log'),
      log: byId('log'),
      codePanel: byId('code-panel'),
    };

    const ORDER = ['BURGER', 'FRIES', 'SODA', 'NUGGETS', 'SUNDAE'];
    const model = new DriveThru(5);
    const selected = new Set(['BURGER']);
    const panel = CodePanel.mount(el.codePanel, {
      source,
      anchors: DriveThru.ANCHORS,
      title: 'DRIVE_THRU.C',
      filename: 'drive_thru.c',
      sections: ['DATA', 'QUEUE OPS', 'STRAIGHT', 'RING', 'DRIVE-THRU', 'MAIN'],
      types: ['Car', 'Queue'],
      formatWatch(w) {
        return `front = ${w.front} \u00B7 rear = ${w.rear} \u00B7 count = ${w.count} \u00B7 capacity = ${w.capacity} \u00B7 ringMode = ${w.ringMode} \u00B7 turnedAway = ${w.turnedAway}`;
      },
    });

    if (Tour) Tour.init({
      seenKey: 'dsa-sims-queue-tour-seen',
      steps: [
        { sel: '#menu-chips', title: 'MENU CHIPS', text: 'Pick 1–3 items. They become the order attached to the next car.' },
        { sel: '#btn-arrive', title: 'ARRIVE', text: 'enqueue(): a new car joins at the REAR of the lane.' },
        { sel: '#btn-serve', title: 'SERVE', text: 'dequeue(): the FRONT car takes its meal and leaves. First in, first out.' },
        { sel: '#lane-panel', title: 'LANE', text: 'The lane is an array of slots. FRONT = pickup window, REAR = entry gate. Try clicking a car in the middle.' },
        { sel: '.lane-toggle', title: 'LANE MODE', text: 'STRAIGHT: cars roll forward after each serve, O(n). RING: the pointers wrap instead, O(1).' },
        { sel: '#btn-peek', title: 'PEEK', text: 'peek(): read the front order without removing the car.' },
        { sel: '#btn-clear', title: 'CLEAR', text: 'clear(): empty the lane at once (front = 0, rear = -1, count = 0).' },
        { sel: '#kitchen', title: 'KITCHEN', text: 'Cooks the FRONT order only. SERVE unlocks when it says READY.' },
        { sel: '#settings > summary', title: 'SETTINGS', text: 'Lane size (3–6), cook time, callouts on/off.' },
        { sel: '#code-panel .code-panel__scroll', title: 'C CODE', text: 'The same queue in C. The running line lights up on every click.' },
        { sel: '#log-panel, #tab-log', title: 'LOG', text: 'Every queue call with its return value, newest first.' },
        { sel: '#tour-start', title: 'TIPS', text: 'Replay this tour anytime.' },
      ],
    });

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let operationNumber = 0;
    let logEntries = [];
    let calloutCounts = { arrive: 0, serve: 0 };
    let calloutTimer = 0;
    let cookTimer = 0;
    let cookTicker = 0;
    let cookStarted = 0;
    let cookDuration = 0;
    let cookingTicket = null;
    let readyTicket = null;
    let lastFormula = '';
    let transientTimer = 0;
    const animations = new Set();
    const uiTimers = new Set();

    const isCalloutsOff = () => document.querySelector('input[name="callouts"]:checked')?.value === 'off';
    const cookTime = () => Number(document.querySelector('input[name="cook-time"]:checked')?.value || 0);
    const safeText = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
    const schedule = (fn, delay) => {
      const id = window.setTimeout(() => { uiTimers.delete(id); fn(); }, delay);
      uiTimers.add(id);
      return id;
    };
    const animate = (node, keyframes, options) => {
      if (!node || reduceMotion.matches || typeof node.animate !== 'function') return null;
      try {
        const animation = node.animate(keyframes, options);
        animations.add(animation);
        animation.onfinish = () => animations.delete(animation);
        animation.oncancel = () => animations.delete(animation);
        return animation;
      } catch (_) { return null; }
    };
    const finishAnimations = () => {
      for (const animation of [...animations]) {
        try { animation.finish(); } catch (_) { /* already finished */ }
      }
      animations.clear();
      for (const id of uiTimers) window.clearTimeout(id);
      uiTimers.clear();
      el.lanePanel.classList.remove('is-shaking', 'is-resetting');
      el.pickupBooth.classList.remove('is-wobbling');
      el.overflowStamp.hidden = true;
      el.noCutting.hidden = true;
      el.wrapBadge.hidden = true;
      document.querySelectorAll('.is-peeking, .is-cutting, .is-shaking').forEach((node) => node.classList.remove('is-peeking', 'is-cutting', 'is-shaking'));
    };

    const showCallout = (text, force = false) => {
      if (isCalloutsOff() && !force) return;
      if (calloutTimer) window.clearTimeout(calloutTimer);
      el.bubbleText.textContent = text;
      el.bubble.hidden = false;
      requestAnimationFrame(() => el.bubble.classList.add('is-visible'));
      calloutTimer = window.setTimeout(() => {
        el.bubble.classList.remove('is-visible');
        schedule(() => { el.bubble.hidden = true; }, reduceMotion.matches ? 0 : 220);
      }, 4000);
    };
    const showLimitedCallout = (kind, text) => {
      calloutCounts[kind] += 1;
      if (calloutCounts[kind] <= 3) showCallout(text);
    };
    const hideCallout = () => {
      if (calloutTimer) window.clearTimeout(calloutTimer);
      calloutTimer = 0;
      el.bubble.classList.remove('is-visible');
      el.bubble.hidden = true;
    };

    const addLog = (text, isError = false) => {
      operationNumber += 1;
      logEntries.unshift({ number: operationNumber, text, isError });
      if (logEntries.length > 80) logEntries.length = 80;
      el.log.replaceChildren(...logEntries.map((entry) => {
        const item = document.createElement('li');
        item.className = `log__line${entry.isError ? ' is-error' : ''}`;
        item.textContent = `#${entry.number} ${entry.text}`;
        return item;
      }));
    };
    const logResult = (result) => addLog(result.log, ['overflow', 'underflow'].includes(result.reason));

    // Both tracks are rendered; only the visible lane's cars have real geometry.
    const activeTrack = () => (model.ringMode ? el.ringTrack : el.straightTrack);
    const captureCars = () => {
      const rects = new Map();
      activeTrack().querySelectorAll('.car-motion[data-ticket]').forEach((node) => {
        rects.set(node.dataset.ticket, node.getBoundingClientRect());
      });
      return rects;
    };
    const colorClass = (ticket) => ['car--pink', 'car--lime', 'car--note', 'car--white'][(ticket - 1) % 4];
    const carMarkup = (car, slotIndex, ring = false) => {
      const label = `Car #${car.ticket}, ${car.order || 'no order'}, slot ${slotIndex}`;
      const angle = ring ? `${slotIndex * (360 / model.queue.capacity)}deg` : '0deg';
      return `<div class="car-motion" data-ticket="${car.ticket}" style="--car-angle:${angle}">
        <button type="button" class="car-button ${colorClass(car.ticket)}" data-ticket="${car.ticket}" aria-label="${safeText(label)}" title="${safeText(label)}">
          <svg viewBox="0 0 56 30" aria-hidden="true"><path d="M8 10 13 4h29l6 6 4 2v12H4V12z" fill="currentColor" stroke="#000" stroke-width="2"/><path d="m17 6-4 6h30l-4-6z" fill="#fff" stroke="#000" stroke-width="1.5"/><circle cx="13" cy="24" r="3" fill="#000"/><circle cx="43" cy="24" r="3" fill="#000"/></svg>
          <span class="car-roof">#${car.ticket}</span>
        </button><span class="car-order">${safeText(car.order)}</span>
      </div>`;
    };
    const pointerTag = (kind, ghost, rearEmpty = false) => {
      const front = kind === 'front';
      const name = front ? 'FRONT · HEAD' : 'REAR · TAIL';
      const tail = rearEmpty ? ' rear = -1' : '';
      return `<span class="pointer-tag pointer-tag--${kind}${ghost ? ' is-ghost' : ''}">${name}${tail}</span>`;
    };
    const pointerMarkup = (index, ring = false) => {
      const q = model.queue;
      const frontHere = q.front === index;
      const ghost = q.isEmpty();
      const rearEmpty = ghost && q.rear === -1 && index === 0;
      const rearHere = q.rear === index || rearEmpty;
      return `<div class="pointer-tags">${frontHere ? pointerTag('front', ghost) : ''}${rearHere ? pointerTag('rear', ghost, rearEmpty) : ''}</div>`;
    };

    const renderLane = () => {
      const q = model.queue;
      const capacity = q.capacity;
      const cars = q.toArray();
      el.straightLane.style.setProperty('--capacity', capacity);
      el.straightTrack.style.setProperty('--capacity', capacity);
      el.straightPointers.style.setProperty('--capacity', capacity);
      el.straightIndices.innerHTML = Array.from({ length: capacity }, (_, index) => `<span>[${index}]</span>`).join('');
      el.straightTrack.innerHTML = Array.from({ length: capacity }, (_, index) => {
        const car = cars[index];
        return `<div class="slot-cell" data-slot="${index}"><span class="slot-outline"></span>${car ? carMarkup(car, index) : ''}</div>`;
      }).join('');
      el.straightPointers.innerHTML = Array.from({ length: capacity }, (_, index) => {
        const markers = pointerMarkup(index);
        return `<div class="pointer-cell">${markers === '<div class="pointer-tags"></div>' ? '' : markers}</div>`;
      }).join('');
      el.straightWatch.textContent = `front = ${q.front} · rear = ${q.rear} · count = ${q.size()}`;

      const ring = model.ringMode;
      el.straightLane.hidden = ring;
      el.ringLane.hidden = !ring;
      el.ringTrack.innerHTML = Array.from({ length: capacity }, (_, index) => {
        const angle = `${index * (360 / capacity)}deg`;
        // Place each slot on a circle (radius 35% of the square track) without container-query units.
        const rad = (index * 2 * Math.PI) / capacity;
        const pos = `left:${(50 + 35 * Math.sin(rad)).toFixed(3)}%;top:${(50 - 35 * Math.cos(rad)).toFixed(3)}%`;
        const markers = pointerMarkup(index, true);
        return `<div class="slot-cell ring-slot" style="--angle:${angle};${pos}" data-slot="${index}"><span class="slot-outline"></span><span class="slot-number">[${index}]</span>${markers === '<div class="pointer-tags"></div>' ? '' : markers}</div>`;
      }).join('');
      // Map the occupied cars to physical ring slots, including a wrapped front.
      if (ring) {
        const bySlot = new Map();
        const ringCars = model.queue.toArray();
        ringCars.forEach((car, offset) => bySlot.set((q.front + offset) % capacity, car));
        el.ringTrack.querySelectorAll('.ring-slot').forEach((slot) => {
          const index = Number(slot.dataset.slot);
          const existing = slot.querySelector('.car-motion');
          const car = bySlot.get(index);
          if (existing) existing.remove();
          if (car) slot.insertAdjacentHTML('beforeend', carMarkup(car, index, true));
        });
      }
      el.ringWatch.textContent = `front = ${q.front} · rear = ${q.rear}`;
      if (lastFormula) { el.ringFormula.textContent = lastFormula; el.ringFormula.hidden = false; }
      else el.ringFormula.hidden = true;
      el.laneSizeReadout.textContent = `${q.size()}/${capacity}`;
      el.fullStamp.hidden = !q.isFull();
      const turned = el.turnedAway.querySelector('b');
      turned.textContent = String(model.turnedAway);
      el.turnedAway.classList.toggle('is-zero', model.turnedAway === 0);
      el.modeStraight.setAttribute('aria-pressed', String(!ring));
      el.modeRing.setAttribute('aria-pressed', String(ring));
      el.clear.disabled = q.isEmpty();
      updateActions();
    };

    const renderRail = () => {
      const cars = model.queue.toArray();
      el.ticketRail.innerHTML = cars.map((car, index) => `<li class="ticket${index === 0 ? ' is-front' : ''}" data-ticket="${car.ticket}" aria-label="Ticket #${car.ticket}, ${safeText(car.order)}">#${car.ticket}<small>${safeText(car.order)}</small></li>`).join('');
    };

    const render = () => {
      renderLane();
      renderRail();
      panel.setWatch({ front: model.queue.front, rear: model.queue.rear, count: model.queue.size(), capacity: model.queue.capacity, ringMode: model.ringMode, turnedAway: model.turnedAway });
    };

    function updateActions() {
      el.arrive.disabled = selected.size === 0;
      el.serve.disabled = cookingTicket !== null;
    }

    const captureTicketClone = (ticket) => {
      const node = activeTrack().querySelector(`.car-motion[data-ticket="${ticket}"]`);
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      const clone = node.cloneNode(true);
      clone.removeAttribute('data-ticket');
      clone.querySelectorAll('[data-ticket]').forEach((child) => child.removeAttribute('data-ticket'));
      clone.classList.add('car-exit-clone');
      Object.assign(clone.style, { position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px`, margin: '0', zIndex: '80', pointerEvents: 'none' });
      document.body.appendChild(clone);
      return clone;
    };
    const animateClone = (clone, keyframes, options) => {
      if (!clone) return;
      const animation = animate(clone, keyframes, options);
      if (animation) animation.onfinish = () => { animations.delete(animation); clone.remove(); };
      else clone.remove();
    };
    const SMOOTH = 'cubic-bezier(.16,1,.3,1)';
    const animateLayout = (beforeRects, arrivingTicket, straightShift = false) => {
      let moved = 0;
      activeTrack().querySelectorAll('.car-motion[data-ticket]').forEach((node) => {
        const oldRect = beforeRects.get(node.dataset.ticket);
        if (oldRect) {
          const rect = node.getBoundingClientRect();
          const dx = oldRect.left - rect.left;
          const dy = oldRect.top - rect.top;
          if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
            // Serve: wait for the front car to start pulling away, then roll forward front-to-back.
            // fill 'backwards' holds each car in its old slot during its delay, so nothing jumps.
            const delay = straightShift ? 140 + moved * 70 : 0;
            animate(node, [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }], { duration: straightShift ? 460 : 280, delay, easing: straightShift ? SMOOTH : 'ease-out', fill: 'backwards' });
            moved++;
          }
        } else if (String(arrivingTicket) === node.dataset.ticket) {
          let from = 'translateX(80px)';
          if (model.ringMode) {
            // Drive in from outside the ring, straight toward this slot.
            const slot = Number(node.closest('.ring-slot')?.dataset.slot || 0);
            const rad = (slot * 2 * Math.PI) / model.queue.capacity;
            from = `translate(${Math.round(Math.sin(rad) * 70)}px, ${Math.round(-Math.cos(rad) * 70)}px)`;
          }
          animate(node, [{ transform: from, opacity: 0 }, { transform: 'translate(0, 0)', opacity: 1 }], { duration: model.ringMode ? 420 : 360, easing: SMOOTH });
        }
      });
    };
    const exitKeyframes = (clone) => {
      let dx = -150;
      let dy = 0;
      if (model.ringMode) {
        const track = document.getElementById('ring-track');
        const t = track && track.getBoundingClientRect();
        const c = clone.getBoundingClientRect();
        if (t && t.width) {
          const vx = c.left + c.width / 2 - (t.left + t.width / 2);
          const vy = c.top + c.height / 2 - (t.top + t.height / 2);
          const len = Math.hypot(vx, vy) || 1;
          dx = (vx / len) * 110;
          dy = (vy / len) * 110;
        }
      }
      return [
        { transform: 'translate(0, 0) scale(1)', opacity: 1, offset: 0 },
        { transform: `translate(${dx * 0.15}px, ${dy * 0.15}px) scale(1.04)`, opacity: 1, offset: 0.25 },
        { transform: `translate(${dx}px, ${dy}px) scale(.92)`, opacity: 0, offset: 1 }
      ];
    };
    const updateCookDisplay = (progress) => {
      el.cookProgress.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };
    const cancelCooking = () => {
      if (cookTimer) window.clearTimeout(cookTimer);
      if (cookTicker) window.clearInterval(cookTicker);
      cookTimer = 0;
      cookTicker = 0;
      cookStarted = 0;
      cookDuration = 0;
      cookingTicket = null;
      readyTicket = null;
      el.kitchenState.hidden = true;
      el.kitchenState.textContent = 'READY ✓';
      el.cookStatus.textContent = 'IDLE';
      el.nowCooking.textContent = 'NO ORDERS';
      el.cookProgress.style.transition = 'none';
      updateCookDisplay(0);
      el.pickupLight.classList.remove('is-ready');
      el.pickupLight.setAttribute('aria-label', 'Kitchen status: idle');
      updateActions();
    };
    const markReady = (ticket) => {
      if (cookingTicket !== ticket) return;
      if (cookTicker) window.clearInterval(cookTicker);
      cookTicker = 0;
      cookTimer = 0;
      cookingTicket = null;
      readyTicket = ticket;
      el.cookStatus.textContent = 'ORDER READY';
      el.kitchenState.hidden = false;
      el.kitchenState.textContent = 'READY ✓';
      updateCookDisplay(1);
      el.pickupLight.classList.add('is-ready');
      el.pickupLight.setAttribute('aria-label', `Kitchen status: order ${ticket} ready`);
      updateActions();
      showCallout(`Order #${ticket} is READY. SERVE is unlocked.`);
      el.laneStatus.textContent = `Order #${ticket} is ready for pickup.`;
    };
    const startCookingFront = () => {
      cancelCooking();
      const car = model.queue.peek();
      if (!car) return;
      el.nowCooking.textContent = `NOW COOKING #${car.ticket} ${car.order}`;
      el.kitchenState.hidden = true;
      el.cookStatus.textContent = `COOKING · ${Math.max(0, cookTime() / 1000).toFixed(cookTime() === 0 ? 0 : 1)} S`;
      el.pickupLight.classList.remove('is-ready');
      el.pickupLight.setAttribute('aria-label', `Kitchen status: cooking order ${car.ticket}`);
      const duration = cookTime();
      cookingTicket = car.ticket;
      if (duration === 0) { markReady(car.ticket); return; }
      cookDuration = duration;
      cookStarted = performance.now();
      updateCookDisplay(0);
      requestAnimationFrame(() => { if (cookingTicket === car.ticket) el.cookProgress.style.transition = `transform ${duration}ms linear`; updateCookDisplay(1); });
      cookTicker = window.setInterval(() => {
        if (cookingTicket !== car.ticket) return;
        const ratio = (performance.now() - cookStarted) / cookDuration;
        if (ratio >= 1) markReady(car.ticket);
      }, 50);
      cookTimer = window.setTimeout(() => markReady(car.ticket), duration);
      updateActions();
    };

    const stopTransient = () => {
      if (transientTimer) window.clearTimeout(transientTimer);
      transientTimer = 0;
      el.overflowStamp.hidden = true;
      el.noCutting.hidden = true;
      el.wrapBadge.hidden = true;
    };
    const showOverflow = (ticket) => {
      el.lanePanel.classList.remove('is-shaking');
      void el.lanePanel.offsetWidth;
      el.lanePanel.classList.add('is-shaking');
      el.overflowStamp.hidden = false;
      el.gateArm.classList.remove('is-open');
      const clone = document.createElement('div');
      clone.className = 'overflow-car';
      clone.innerHTML = `<span>! #${ticket}</span>`;
      const gate = document.querySelector('.entry-gate');
      if (gate) {
        gate.appendChild(clone);
        const turn = animate(clone, [{ transform: 'translateX(0) rotate(0)' }, { transform: 'translateX(35px) rotate(160deg)', opacity: .2 }], { duration: 520, easing: 'ease-in' });
        if (turn) turn.finished.then(() => clone.remove(), () => clone.remove());
        else clone.remove();
      }
      transientTimer = schedule(() => { el.overflowStamp.hidden = true; el.lanePanel.classList.remove('is-shaking'); }, 1500);
    };
    const showCutIn = (ticket) => {
      const node = activeTrack().querySelector(`.car-button[data-ticket="${ticket}"]`);
      node?.classList.add('is-cutting');
      el.noCutting.hidden = false;
      transientTimer = schedule(() => { el.noCutting.hidden = true; node?.classList.remove('is-cutting'); }, 1200);
    };
    const showWrap = (result) => {
      if (!result.wrapped) return;
      const cap = result.watch.capacity;
      if (result.op === 'arrive') {
        const oldRear = (result.watch.rear - 1 + cap) % cap;
        lastFormula = `rear = (${oldRear} + 1) % ${cap} = ${result.watch.rear}`;
        if (model.ringMode) el.ringFormula.textContent = lastFormula;
        showCallout(`Wrap-around! rear = (${String.fromCharCode(82, 8320)} + 1) % ${cap} = ${result.watch.rear}. Slot [${result.watch.rear}] was free, so the ring reuses it. No car moved.`);
      } else {
        const oldFront = (result.watch.front - 1 + cap) % cap;
        lastFormula = `front = (${oldFront} + 1) % ${cap} = ${result.watch.front}`;
        showCallout(`Wrap-around! front = (${String.fromCharCode(70, 8320)} + 1) % ${cap} = ${result.watch.front}.`);
      }
      el.wrapBadge.hidden = false;
      transientTimer = schedule(() => { el.wrapBadge.hidden = true; }, 1300);
    };
    const applyCallout = (result, beforeCount) => {
      if (result.reason === 'overflow') {
        let text = `Queue Overflow! The lane is full (${result.watch.count}/${result.watch.capacity}). enqueue() returned false, so car #${result.car.ticket} was turned away. Turned away: ${result.watch.turnedAway}.`;
        if (model.ringMode && result.watch.front !== 0) text += ' Full means count == capacity, not rear == C-1.';
        showCallout(text);
      } else if (result.reason === 'underflow') {
        showCallout('Queue Underflow! dequeue() on an empty lane returned false. Nobody to serve.');
      } else if (result.op === 'arrive' && result.ok) {
        showLimitedCallout('arrive', `enqueue(): car #${result.car.ticket} joins at the REAR. rear = ${result.watch.rear}, size ${result.watch.count}/${result.watch.capacity}.`);
      } else if (result.op === 'serve' && result.ok) {
        if (model.ringMode) showLimitedCallout('serve', `dequeue() served #${result.car.ticket}. FRONT moved to slot ${result.watch.front}; no car moved. O(1).`);
        else showLimitedCallout('serve', `dequeue() served #${result.car.ticket} from the FRONT: First In, First Out. The other ${result.shifted} cars each rolled forward one slot: ${result.shifted} copies, O(n).`);
      } else if (result.op === 'peek') {
        if (result.car) showCallout(`peek() → #${result.car.ticket} ${result.car.order}. You read the FRONT order without removing the car. Size is still ${result.watch.count}. The kitchen uses this to know what to cook.`);
        else showCallout('peek() → NULL: the lane is empty.');
      } else if (result.op === 'clear') {
        showCallout(`clear(&lane) reset front = 0, rear = -1, count = 0: ${beforeCount} cars gone at once. The kitchen threw away their orders.`);
      } else if (result.op === 'reset') {
        const mode = model.ringMode ? 'RING' : 'STRAIGHT';
        showCallout(`Lane reset: ${mode} lane, ${result.watch.capacity} spots.`);
      }
    };

    const perform = (action, options = {}) => {
      finishAnimations();
      stopTransient();
      const beforeCount = model.queue.size();
      const beforeRects = captureCars();
      const exitTicket = action === 'serve' && beforeCount ? model.queue.peek().ticket : null;
      const exitClone = exitTicket != null ? captureTicketClone(exitTicket) : null;
      const clearClones = action === 'clear' ? model.queue.toArray().map((car, index) => ({ clone: captureTicketClone(car.ticket), index })) : [];
      const result = options.invoke ? options.invoke() : model[action](...(options.args || []));
      if (!result) return null;

      if (result.op === 'reset') {
        cancelCooking();
        lastFormula = '';
        el.lanePanel.classList.add('is-resetting');
        schedule(() => el.lanePanel.classList.remove('is-resetting'), 460);
      } else if (result.op === 'clear') {
        cancelCooking();
      }
      render();
      panel.play(result);
      logResult(result);
      applyCallout(result, beforeCount);
      showWrap(result);
      animateLayout(beforeRects, result.op === 'arrive' && result.ok ? result.car.ticket : null, result.op === 'serve' && !model.ringMode);

      if (result.op === 'serve' && result.ok) {
        if (exitClone) animateClone(exitClone, exitKeyframes(exitClone), { duration: 560, easing: 'cubic-bezier(.45,0,.55,1)', fill: 'forwards' });
        cancelCooking();
        if (model.queue.size()) startCookingFront();
      } else if (exitClone) exitClone.remove();
      if (result.op === 'clear' && clearClones.length) {
        clearClones.forEach(({ clone, index }) => animateClone(clone, [{ opacity: 1, transform: 'translateX(0)' }, { opacity: 0, transform: 'translateX(-35px)' }], { duration: 200, delay: index * 80, easing: 'ease-out' }));
      }
      if (result.op === 'arrive' && result.reason === 'overflow') showOverflow(result.car.ticket);
      if (result.op === 'arrive' && result.ok) {
        el.gateArm.classList.add('is-open');
        schedule(() => el.gateArm.classList.remove('is-open'), 340);
        if (beforeCount === 0) startCookingFront();
      }
      updateActions();
      return result;
    };

    const handleArrive = () => {
      if (!selected.size) return;
      const order = ORDER.filter((item) => selected.has(item)).join(' + ').slice(0, 31);
      perform('arrive', { invoke: () => model.arrive(order) });
      el.laneStatus.textContent = `ARRIVE complete. Lane ${model.queue.size()} of ${model.queue.capacity}.`;
      if (model.ringMode && lastFormula) el.ringFormula.hidden = false;
    };
    const handleServe = (keyboard = false) => {
      if (cookingTicket !== null) {
        if (keyboard) showCallout(`Order #${cookingTicket} is still cooking. SERVE unlocks when it's READY.`);
        return;
      }
      const result = perform('serve');
      if (result?.reason === 'underflow') {
        el.pickupBooth.classList.add('is-wobbling');
        schedule(() => el.pickupBooth.classList.remove('is-wobbling'), 800);
      }
    };
    const handlePeek = () => {
      const frontCar = model.queue.peek();
      const result = perform('peek');
      if (!result) return;
      if (frontCar) {
        activeTrack().querySelector(`.car-button[data-ticket="${frontCar.ticket}"]`)?.classList.add('is-peeking');
        document.querySelector(`.ticket[data-ticket="${frontCar.ticket}"]`)?.classList.add('is-peeking');
        schedule(() => document.querySelectorAll('.is-peeking').forEach((node) => node.classList.remove('is-peeking')), 1500);
      }
      el.laneSizeReadout.classList.add('is-pulsing');
      schedule(() => el.laneSizeReadout.classList.remove('is-pulsing'), 1500);
    };
    const handleClear = () => perform('clear');
    const handleReset = (ringMode, capacity) => perform('reset', { args: [ringMode, capacity] });

    const setTab = (tab) => {
      el.panels.dataset.tab = tab;
      el.tabCode.setAttribute('aria-selected', String(tab === 'code'));
      el.tabLog.setAttribute('aria-selected', String(tab === 'log'));
      el.tabCode.tabIndex = tab === 'code' ? 0 : -1;
      el.tabLog.tabIndex = tab === 'log' ? 0 : -1;
    };

    el.arrive.addEventListener('click', handleArrive);
    el.serve.addEventListener('click', () => handleServe(false));
    el.peek.addEventListener('click', handlePeek);
    el.peekMobile.addEventListener('click', handlePeek);
    el.clear.addEventListener('click', handleClear);
    el.modeStraight.addEventListener('click', () => { if (model.ringMode) handleReset(false, model.queue.capacity); });
    el.modeRing.addEventListener('click', () => { if (!model.ringMode) handleReset(true, model.queue.capacity); });
    el.laneSize.addEventListener('change', () => handleReset(model.ringMode, Number(el.laneSize.value)));
    el.menuChips.addEventListener('click', (event) => {
      const chip = event.target.closest('.menu-chip');
      if (!chip) return;
      const item = chip.dataset.order;
      if (selected.has(item)) selected.delete(item);
      else if (selected.size >= 3) {
        chip.classList.add('is-shaking');
        schedule(() => chip.classList.remove('is-shaking'), 600);
        return;
      } else selected.add(item);
      chip.setAttribute('aria-pressed', String(selected.has(item)));
      updateActions();
    });
    el.straightTrack.addEventListener('click', (event) => {
      const button = event.target.closest('.car-button');
      if (!button) return;
      const ticket = Number(button.dataset.ticket);
      const front = model.queue.peek();
      if (front?.ticket === ticket) { handlePeek(); return; }
      finishAnimations();
      stopTransient();
      el.noCutting.hidden = false;
      button.classList.add('is-cutting');
      const frontTicket = front ? `#${front.ticket}` : 'nobody';
      const clicked = `#${ticket}`;
      showCallout(`No cutting the line! A queue has no getAt(i): only the FRONT can leave and only the REAR can join. Serving ${clicked} now would skip ${frontTicket}, breaking First In, First Out.`);
      addLog(`CUT IN  ${clicked} refused: no getAt(i) in a queue`, true);
      transientTimer = schedule(() => { el.noCutting.hidden = true; button.classList.remove('is-cutting'); }, 1200);
    });
    el.ringTrack.addEventListener('click', (event) => {
      const button = event.target.closest('.car-button');
      if (!button) return;
      const ticket = Number(button.dataset.ticket);
      const front = model.queue.peek();
      if (front?.ticket === ticket) handlePeek();
      else {
        finishAnimations(); stopTransient(); el.noCutting.hidden = false; button.classList.add('is-cutting');
        showCallout(`No cutting the line! A queue has no getAt(i): only the FRONT can leave and only the REAR can join. Serving #${ticket} now would skip #${front?.ticket}, breaking First In, First Out.`);
        addLog(`CUT IN  #${ticket} refused: no getAt(i) in a queue`, true);
        transientTimer = schedule(() => { el.noCutting.hidden = true; button.classList.remove('is-cutting'); }, 1200);
      }
    });
    el.tabCode.addEventListener('click', () => setTab('code'));
    el.tabLog.addEventListener('click', () => setTab('log'));
    document.querySelectorAll('input[name="callouts"]').forEach((radio) => radio.addEventListener('change', () => { if (isCalloutsOff()) hideCallout(); }));

    document.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.altKey || event.metaKey || document.querySelector('.tour')) return;
      if (event.target.closest('input, select, textarea, [contenteditable="true"]')) return;
      const key = event.key.toLowerCase();
      if (key === 'a') { event.preventDefault(); handleArrive(); }
      else if (key === 's') { event.preventDefault(); handleServe(true); }
      else if (key === 'p') { event.preventDefault(); handlePeek(); }
    });
    if (el.settings) {
      const summary = el.settings.querySelector('summary');
      document.addEventListener('click', (event) => { if (el.settings.open && !el.settings.contains(event.target)) el.settings.open = false; });
      el.settings.addEventListener('keydown', (event) => {
        if (event.key !== 'Escape' || !el.settings.open) return;
        el.settings.open = false;
        summary?.focus();
      });
    }

    // A settings change affects the next order that starts; the current cook keeps its timer.
    el.laneSize.value = '5';
    document.querySelector('input[name="cook-time"][value="1500"]').checked = true;
    setTab('code');
    render();
    cancelCooking();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
