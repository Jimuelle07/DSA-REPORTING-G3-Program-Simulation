/* TIPS onboarding tour: spotlights each control with a one-line explanation.
   Runs once on the first visit; the TIPS button replays it. No DOM dependencies on editor.js. */
(() => {
  'use strict';

  // `sel` may list alternatives; the first one visible at the current screen size is used.
  const DEFAULT_STEPS = [
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
  ];

  const isVisible = (node) => node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden';
  const findTarget = (step) => step.sel.split(',').map((s) => document.querySelector(s.trim())).find(isVisible) || null;
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const start = (configuredSteps, seenKey) => {
    const trigger = document.getElementById('tour-start');
    const steps = configuredSteps.map((step) => ({ ...step, target: findTarget(step) })).filter((step) => step.target);
    if (!steps.length) return;
    let index = 0;
    const returnFocus = document.activeElement;

    const root = document.createElement('div');
    root.className = 'tour';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'tour-title');
    root.innerHTML = `
      <div class="tour__spot"></div>
      <div class="tour__card">
        <p class="tour__step" aria-live="polite"></p>
        <h2 class="tour__title" id="tour-title"></h2>
        <p class="tour__text"></p>
        <div class="tour__actions">
          <button type="button" class="btn btn--white tour__skip">SKIP</button>
          <button type="button" class="btn btn--white tour__back">BACK</button>
          <button type="button" class="btn tour__next">NEXT</button>
        </div>
      </div>`;
    document.body.appendChild(root);
    const spot = root.querySelector('.tour__spot');
    const card = root.querySelector('.tour__card');
    const ui = {
      step: root.querySelector('.tour__step'),
      title: root.querySelector('.tour__title'),
      text: root.querySelector('.tour__text'),
      skip: root.querySelector('.tour__skip'),
      back: root.querySelector('.tour__back'),
      next: root.querySelector('.tour__next'),
    };

    // Spotlight the target and park the card below it, else above it, else at the viewport bottom.
    const place = () => {
      const target = steps[index].target;
      const r = target.getBoundingClientRect();
      const pad = 6;
      const margin = 12;
      spot.style.top = `${r.top - pad}px`;
      spot.style.left = `${r.left - pad}px`;
      spot.style.width = `${r.width + pad * 2}px`;
      spot.style.height = `${r.height + pad * 2}px`;
      const cw = card.offsetWidth;
      const ch = card.offsetHeight;
      const vw = document.documentElement.clientWidth;
      const vh = window.innerHeight;
      const clampLeft = (x) => Math.min(Math.max(margin, x), vw - cw - margin);
      const clampTop = (y) => Math.min(Math.max(margin, y), vh - ch - margin);
      let top;
      let left = clampLeft(r.left + r.width / 2 - cw / 2);
      if (r.bottom + pad + margin + ch <= vh) top = r.bottom + pad + margin;
      else if (r.top - pad - margin - ch >= 0) top = r.top - pad - margin - ch;
      else if (r.left - pad - margin - cw >= margin) {
        // Tall target (e.g. the code panel): sit beside it instead of on top of it.
        top = clampTop(r.top);
        left = r.left - pad - margin - cw;
      } else if (r.right + pad + margin + cw <= vw - margin) {
        top = clampTop(r.top);
        left = r.right + pad + margin;
      } else top = vh - ch - margin;
      card.style.top = `${Math.max(margin, top)}px`;
      card.style.left = `${left}px`;
    };

    // Scroll only as needed: leave room for the card above or below the target when possible.
    const reveal = (target) => {
      const behavior = reducedMotion() ? 'auto' : 'smooth';
      const r = target.getBoundingClientRect();
      const vh = window.innerHeight;
      const room = card.offsetHeight + 12 * 3 + 6 * 2;
      const visible = r.top >= 0 && r.bottom <= vh;
      if (visible && (vh - r.bottom >= room || r.top >= room)) return;
      if (r.height + room <= vh) {
        window.scrollTo({ top: window.scrollY + r.top - 12 - 6, behavior });
      } else {
        target.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
      }
    };

    const show = (next) => {
      index = Math.max(0, Math.min(steps.length - 1, next));
      const step = steps[index];
      ui.step.textContent = `${index + 1} / ${steps.length}`;
      ui.title.textContent = step.title;
      ui.text.textContent = step.text;
      ui.back.disabled = index === 0;
      ui.next.textContent = index === steps.length - 1 ? 'DONE' : 'NEXT';
      reveal(step.target);
      place();
      ui.next.focus({ preventScroll: true });
    };

    const close = () => {
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      document.removeEventListener('keydown', onKey, true);
      root.remove();
      try { localStorage.setItem(seenKey, '1'); } catch (_) { /* storage unavailable */ }
      const focusTo = trigger || returnFocus;
      if (focusTo && typeof focusTo.focus === 'function') focusTo.focus({ preventScroll: true });
    };

    const onKey = (event) => {
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'ArrowRight') { event.preventDefault(); if (index < steps.length - 1) show(index + 1); return; }
      if (event.key === 'ArrowLeft') { event.preventDefault(); show(index - 1); return; }
      if (event.key === 'Tab') {
        // Keep focus inside the card while the tour is open.
        const buttons = [ui.skip, ui.back, ui.next].filter((b) => !b.disabled);
        const at = buttons.indexOf(document.activeElement);
        event.preventDefault();
        const move = event.shiftKey ? -1 : 1;
        buttons[(at + move + buttons.length) % buttons.length].focus();
      }
    };

    ui.skip.addEventListener('click', close);
    ui.back.addEventListener('click', () => show(index - 1));
    ui.next.addEventListener('click', () => (index === steps.length - 1 ? close() : show(index + 1)));
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    document.addEventListener('keydown', onKey, true);
    show(0);
  };

  function init(config) {
    config = config || {};
    const steps = Array.isArray(config.steps) ? config.steps : DEFAULT_STEPS;
    const seenKey = String(config.seenKey || 'dsa-sims-tour-seen');
    const startConfigured = () => start(steps, seenKey);
    const trigger = document.getElementById('tour-start');
    if (trigger) trigger.addEventListener('click', startConfigured);
    let seen = false;
    try { seen = localStorage.getItem(seenKey) === '1'; } catch (_) { seen = true; }
    if (!seen) window.setTimeout(startConfigured, 600);
  }

  globalThis.Tour = { init: init };
})();
