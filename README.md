# DSA SIMS

Interactive, browser-based data-structure simulations: a **stack (LIFO)** undo/redo text editor and a **queue (FIFO)** drive-thru kitchen.

**Live site:** https://dsa-reporting-g3-program-simulation.vercel.app/

## Simulations

### Stack — Undo / Redo (`/stack/`)

Every edit is recorded as an action block holding the document before and after the change. A new edit pushes its block onto the **Undo Stack**; **UNDO** pops the top block, restores its `before` text, and pushes the same block onto the **Redo Stack**; **REDO** pops from Redo, restores `after`, and pushes back onto Undo. Any new edit while Redo holds blocks **clears Redo** (history branching). A full Undo Stack evicts its oldest block; popping an empty stack is an **underflow**. `peek()` reads the top without removing it; `clear()` empties a stack but leaves the document text unchanged.

Controls: free typing in the text box, a word input plus **TYPE** (or Enter), **DELETE**, **UNDO**, **REDO**, and **PEEK** / **CLEAR** on each stack. `SETTINGS` holds **GRANULARITY** (Word / Keystroke), **MAX HISTORY** (3–6, default 6), and **CALLOUTS** on/off. Keyboard: `Ctrl+Z` undo, `Ctrl+Y` / `Ctrl+Shift+Z` redo.

### Queue — Drive-Thru & Kitchen (`/queue/`)

Selecting menu chips builds one order. **ARRIVE** enqueues a car at the REAR; the kitchen cooks the FRONT order, and **SERVE** dequeues the front car (locked while that order is COOKING). **PEEK** reads the front without removing it; **CLEAR** empties the lane. A full lane produces **overflow** (the car is turned away) and serving an empty lane produces **underflow**. Clicking a car that is not the front is refused, because a queue has no middle access.

**STRAIGHT vs RING:** in STRAIGHT the front is always slot `[0]`, and each serve shifts every remaining car forward one slot (a `for` loop, O(n)). In RING, `front` and `rear` advance with `(i + 1) % capacity`, so no car moves and both operations are O(1); a `count` field distinguishes a full ring from an empty one.

**Cook timer:** `SETTINGS → COOK TIME` is OFF / 1.5 S / 3 S (default 1.5 S). A change applies to the next order that starts cooking; the current order keeps its timer. `SETTINGS` also holds **LANE SIZE** (3–6, default 5) and **CALLOUTS** on/off. Keyboard: `A` arrive, `S` serve, `P` peek.

Both pages have a TIPS tour, a live C code panel, an operation log, and callout bubbles. On phones, `C CODE` / `LOG` tabs switch between the panels.

## C trace

Each simulation embeds the same algorithm written in C (array-based, fixed capacity) beside the visuals. On every action the code panel highlights the lines the C would execute — including overflow, underflow, wrap-around, and loop counts — while a watch strip reports the live variables. The panel offers COPY, a `.C` download, and a FOLLOW toggle that auto-scrolls to the running line.

## Local preview

The site is plain HTML, CSS, and JavaScript: no build step and no application dependency installation. From the repository root:

```sh
npx serve .
```

Open `http://localhost:3000/`, then visit `/stack/` or `/queue/`. `serve.json` mirrors the Vercel routing, and any local static server for this directory works. A server is required (rather than opening an HTML file directly) to exercise the service worker.

## C checks (optional)

Compiles both embedded C programs and diffs their output against the checked-in expected output:

```sh
node scripts/check-c.mjs          # both programs
node scripts/check-c.mjs stack    # stack only
node scripts/check-c.mjs queue    # queue only
```

Requires Node.js and a C99 compiler. It uses `gcc` by default, or the compiler named by the `CC` environment variable, with `-std=c99 -Wall -Wextra -Wpedantic -Werror -O2`. The check is not needed to view the site.

## Repository layout

| Path | Purpose |
| --- | --- |
| `index.html` | Landing page linking to both simulations |
| `stack/` | Stack page, editor, dual-stack model, `Stack` class, and C source |
| `queue/` | Queue page, drive-thru and kitchen UI, model, `Queue` class, and C source |
| `assets/` | Shared theme and simulation chrome, code panel, tour, service-worker registration, and fonts |
| `scripts/` | `check-c.mjs` plus the expected outputs for both C programs |
| `sw.js` | Service worker: precache and offline serving |
| `serve.json`, `vercel.json`, `.vercelignore` | Local preview and static-host configuration |
| `robots.txt`, `sitemap.xml` | Crawler metadata |

## Offline

`sw.js` precaches the pages and their assets on the first online visit. After that, the landing page and both simulations load and run offline on the same origin, and cached assets are refreshed in the background when a connection returns. Bump `CACHE_VERSION` in `sw.js` for a new deploy.

## Deployment

Deploy the repository as a **static Vercel project** with the repository root as the output directory and no build command. `vercel.json` enables `cleanUrls` and `trailingSlash` and serves `/sw.js` with `Cache-Control: no-cache` so service-worker updates are discovered promptly. `.vercelignore` keeps `scripts/`, the Markdown docs, `.git`, `.gitignore`, and `serve.json` out of the deployment.

## Design docs

[STACK.md](STACK.md) and [QUEUE.md](QUEUE.md) document each simulation in detail: the algorithm, data structures, the full C source and trace anchors, UI and animation specs, callouts, edge cases, and acceptance checklists.
