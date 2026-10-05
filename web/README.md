# EucliDraw web editor

First milestone of the math visualization product described in
[PRODUCT_PLAN.md](../PRODUCT_PLAN.md). The existing Python application is preserved.

## Run

Requires Node.js 24 or newer; no external packages are required for the app.

```bash
cd ~/math/EucliDraw/web
npm run dev
```

Open **http://127.0.0.1:4173**. Keep the terminal running. Use `PORT=4174 npm run dev`
if the default port is occupied. The server listens only on the local machine.

## Implemented

- Mathematical world coordinates independent of pan and zoom.
- Free points, segments, infinite lines, vectors, triangles, and circles.
- Midpoints with persisted references that update when their source points move.
- Selection, Shift multi-selection, drag, numeric coordinate editing, style editing,
  visibility and movement locks.
- Move a shape by translating its referenced free points; shared points move once.
  Moving shared points also changes other connected shapes. Derived points are read-only.
- Grid and half-unit snapping. Arrow keys move selected free points by 0.1 units;
  Shift increases the step to 1 unit. Space or the hand tool pans; the wheel zooms.
- Undo/redo with one history entry per drag, including dependent deletion and restoration.
- Browser autosave, versioned `.euclidraw` JSON file export/import, validation of
  references/cycles/numbers, and current-view SVG export.

The default sample contains a triangle ABC, midpoint M of AB, and median CM.
Drag A or B to see M update. Use the right-hand properties panel for exact input.
To create a midpoint, choose the midpoint tool and click two existing points.
To create a circle, choose its center point and then click the desired radius.

## Architecture

`src/model.ts` owns the mathematical document, evaluation, validation, coordinates,
relationships, and history. `src/main.ts` implements the SVG interface. The first
checkpoint uses native browser APIs because React packages could not be downloaded
in the development environment. The math core is separate so a React view can be
introduced later. This is a first milestone, not completion of the product plan.

The build uses Node's experimental `stripTypeScriptTypes` API. It strips types and
**does not type-check**. Compilation and runtime checks are recorded separately.
A conventional TypeScript compiler and UI toolchain remain a follow-up task once
package downloads are available. Generated `dist/` files are not committed.

## Checks

```bash
npm test
npm run build
```

There are 16 mathematical/document/history checks. An optional browser test covers
real pointer dragging, numeric editing, undo/redo, file save/import, autosave,
invalid files, dependent deletion, and SVG export:

```bash
npm install --no-save playwright
npx playwright install chromium
npm run test:browser
```

You can point `PLAYWRIGHT_MODULE` to an existing Playwright `index.mjs` file instead
of installing it again. Browser tests write outputs under `test-results/`.

**Checkpoint verification:** all 16 core checks passed; build succeeded. Browser
execution and the local HTTP server were blocked by the development sandbox
(`Operation not permitted`). The browser test is provided but has not passed in
that environment. Visual layout and end-to-end behavior require verification on
an unrestricted machine.

## Scope still pending

General polygon editing, duplication/grouping, endpoint re-binding, advanced
constructions, functions, formula rendering, matrices, timeline, PNG export,
Manim integration, and 3D. Autosave belongs to this browser/profile/origin; file
export is the portable backup. PNG is not implemented in this checkpoint.
