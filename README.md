# KaneAI — tldraw edition (kane-tldraw)

The new Kane experience rebuilt on **[tldraw](https://tldraw.dev)**, per the v3 instructions:
the canvas/card foundation comes from the official **image-pipeline starter kit**
(`npm create tldraw@latest -- --template image-pipeline`, tldraw 5.2.5), and the AI
conversation follows the **agent starter kit**'s chat-panel pattern, moved to the left as a
floating window and fused with the previous build's omnibox.

## Run

```bash
npm install
npm run dev      # http://localhost:5180
```

No backend, no API keys — everything runs client-side (see “Prototype notes”).

## Live site (GitHub Pages)

`.github/workflows/deploy.yml` builds the site on every push to `main` and
publishes it to **https://rajat-lt.github.io/kane-tldraw/** — but only once the
repository has a **`TLDRAW_LICENSE_KEY`** secret. Until then each run only
checks that the project builds.

That is tldraw's license, not a choice in this repo. tldraw is free to use in a
*Development Environment* — internal hosting not accessible to the public, such
as `localhost`. A public site is a *Production Environment*, which needs a trial
or commercial license; and tldraw 5.2.5 enforces it in code — on any `https`
host that isn't `localhost` in a production build, with no key, it hides the
editor five seconds after the page loads. The license also forbids working
around that enforcement, so this repo doesn't.

To put the site live:

1. Get a tldraw license key (trial or commercial) — https://tldraw.dev, or
   sales@tldraw.com.
2. In this repo: **Settings → Secrets and variables → Actions → New repository
   secret**, name `TLDRAW_LICENSE_KEY`, paste the key.
3. **Actions → Deploy to GitHub Pages → Run workflow.**

The key reaches tldraw as `VITE_TLDRAW_LICENSE_KEY` at build time (see the
`licenseKey` prop in `src/App.tsx`). It never belongs in the repo itself.

## What's here (mapped to the instructions)

1. **tldraw foundation** — real tldraw editor: selection, marquee, undo/redo,
   snapping, persistence (`persistenceKey: "kane-tldraw"`), infinite canvas.
2. **Starter-kit architecture** — the image-pipeline kit's node system is kept intact
   (`NodeShapeUtil`, typed ports, `ConnectionShapeUtil` + bindings, drag-from-port,
   on-canvas picker on connection drop, “+” insert-on-connection, `ExecutionGraph`
   parallel runner, run-region overlays). Port data types are now
   `flow` (blue, step order) and `value` (green, data).
3. **Cards** (`src/nodes/types/`) —
   - **If / Else** — If + up to 5 Else-If blocks + Else, each block authorable in
     natural language or operand→operator→operand (toggle per card), one output port
     per branch; the taken branch highlights after a run.
   - **Parameter / Secret / TOTP Auth / Variable** — name + default value; Secret is
     masked with reveal; TOTP shows a live 6-digit code on a 30s window (mock);
     all expose a green `value` output that Input boxes can consume (`{{name}}` also works).
   - **Click** — target + single/double/right.
   - **Input box** — target + text (typed or wired from a data card) + press-Enter.
   - **While loop** — condition + max iterations, `Loop body` and `Done` branches.
   - **Modules** — a named tldraw **frame** (like a Figma section). Saved modules live in
     the right-bar drawer and stamp editable copies (cards + connections wrapped in a frame).
   - *(Open page — navigation card so workflows have a runnable start.)*
4. **Objective → workflow** — type a high-level objective into the agent
   (e.g. *“Test the login flow with valid credentials and a 2FA OTP code”*) and it streams
   a plan into the chat (messages + action log + todo checklist) while building a connected
   workflow card-by-card on the canvas. Say **“run”** (or press ▶ on a region) to execute:
   cards light up in order, If/Else takes a branch, and the browser animates the steps.
5. **Browser both ways** — the **Browser** segment opens the split view from the previous
   build (squeezed canvas + draggable separator that collapses under 240px with the
   peek-out restore button). The **pop-out button** in the sub-topbar detaches the browser
   into a **floating sub-window** (Figma-preview style: drag by the title bar, resize from
   the corner, dock back, close).
6. **Contextual toolbar** — `TldrawUiContextualToolbar` above the selection, per card type:
   run-from-here/duplicate/delete everywhere, plus NL↔operand toggle and ±Else-If (If/Else),
   click-type segmented (Click), press-Enter toggle (Input), iteration stepper (While), and
   run/rename/fit/delete on module frames.
7. **Single page** — `maxPages: 1`, page menu hidden.
8. **Same chrome as last time** — Topbar (logo, inline-editable filename, info popover,
   Save draft / Create test, avatar menu) and Right bar (two icon groups, left tooltips,
   slide-in drawers; Modules is the functional panel) ported from `new-kane`.
9. **Agent window on the left, floating** — draggable by its header anywhere over the canvas.
10. **All omnibox functions merged into the agent composer** — quick-add icons, Context icon,
    slash commands (typed `/` filters; `/` icon adds a search box), Plus popover
    (attachments local/Drive/OneDrive · Browser-mode toggle · all commands), attachment chips
    with drag-&-drop + type/20MB validation toast, `#TC-123` blue mentions, 3→6-line
    auto-grow then scroll, maximize to 50% viewport, Enter/Shift+Enter, send↔stop.
11. **Minimap bottom-right** — same translucent Kane minimap, now driving the tldraw camera
    (drag the viewport rectangle, click to jump).
12. **Grid dots** — native tldraw feature: the default grid *is* a dot grid
    (`editor.updateInstanceState({ isGridMode: true })`), tinted via `.tl-grid-dot`.

**Recording** still works like last time: toggle Record in the browser, interact with the
mock page, and merged steps (open/input/click) land as connected cards on the squeezed
canvas with auto-pan.

## Batch 2 (2026-07-19)

1. **Run cursor** — a Figma-prototype-style pill pinned to a card's top-left edge; its ▶
   starts the run from that card, dragging it re-pins the start, and while running it
   follows the currently executing card. Per-card “Play from here” footers and the region
   play buttons were removed (`src/kane/RunCursor.tsx`; regions still show grouping +
   run glow).
2. **Undo / redo in the topbar** (reactive `getCanUndo`/`getCanRedo`).
3. **Last-run screenshots** on Open/Click/Input cards — wireframe thumbnail of the mock
   page view when the card last ran, with the target chip (`lastShot` prop, optional for
   older documents; cleared via “Clear last result”).
4. Connection **“+” opens the same card picker** and splices the pick into the wire
   (already the starter-kit behavior — verified).
5. **Toolbar merged logically**: Select/Hand · browser cards · logic cards · a Data
   dropdown (Parameter/Secret/TOTP/Variable) · Module · Beautify, with the
   **Canvas/Browser segmented control at the toolbar's right edge**.
6. **Session status chip moved to the topbar** (Idle/Running/… with live colors).
7. **Beautify** — `beautifyCanvas` lays out each workflow component in depth columns,
   parks data cards above their consumers, stacks separate flows vertically, animates via
   `editor.animateShapes`, then zooms to fit. Cards inside module frames are left alone.
8. **Right bar trimmed** (Snippets/AI assist/Stack removed); the power button only toasts —
   never opens a drawer.
9. **Easing everywhere** — token easings, popover/window/drawer/chip/theme transitions.
10. **Omnibox fixed bottom-right** (not draggable); quick-add row removed (the toolbar owns
    card creation now). The minimap sits beside it (hidden in the narrow split column).
11. **Agent-window features in the omnibox**: collapsible canvas-edit groups in the chat
    history, agent todo list, @-context (selected cards / visible area — a selected-card
    context anchors the planner to chain from it), model picker (local planner; real models
    listed as needing API keys), new-chat, interrupt/stop.
12. **Topbar canvas counts** — runnable start cards, incomplete cards (missing URL/target),
    assertion (If/Else) cards; live.
13. **Popover/tooltip clipping fixed** — the panel no longer clips its sub-popovers
    (`overflow: visible` + z-index layering).
14. **Native right-click disabled** on canvas and cards.
15. **Custom card context menu** — run from card, set run start, per-type ops (else-if
    blocks, NL↔operand, click type, press-Enter, iterations), duplicate, clear result,
    delete; module frames get run/rename/fit/dissolve.
16. **Grid dots appear only past 40% zoom** (`GRID_MIN_ZOOM`).
17. **Dark theme toggle in the topbar** — full token remap + tldraw `colorScheme`,
    persisted in localStorage.

## Batch 3 (2026-07-19)

1. **Connection “+” fixed** — the root cause was the picker opening on pointer-*down*,
   so the same interaction's trailing events hit its outside-dismiss and closed it
   instantly. It now opens after the click completes (plus a just-opened dismiss
   guard); handles activate from 35 % zoom.
2. **Vertical toolbar** docked to the canvas's left edge (`KaneSideToolbar`).
3. Toolbar order: Select · Data cards (Parameter/TOTP/Secret/Variable popover) ·
   Controls (If-Else/While popover) · Mostly used (Click/Open/Input popover) ·
   Module · Beautify (13: directly on the bar). No hand tool.
4. **⌘F find-on-canvas** — searches titles, custom names and card text fields;
   next/prev (Enter / ⇧Enter), Esc closes, jumps + selects each match.
5. **Mac shortcuts everywhere**, shown in tooltips and popovers: ⌥P/⌥T/⌥S/⌥V data
   cards, ⌥I/⌥W controls, ⌥C/⌥O/⌥N mostly-used, ⌥M module, ⌥B beautify, V select.
6. **Omnibox on the left** (beside the toolbar), **minimap bottom-right**.
7. **Canvas/Browser segmented control lives in the omnibox header.**
8. The popped-out browser has **no mode switch** in its bar and a compact Record
   button.
9. **Card screenshots v2** — explicit “SCREENSHOT · LAST RUN” header with camera
   icon and a view pill over a framed page wireframe with the target chip.
10. The **Run label refuses cards that aren't part of the workflow** (drop snaps
    back with a toast).
11. **Single-workflow rule** — a connection that would create a second disjoint
    page-level workflow is removed on the spot (store side effect); the planner
    chains onto the existing workflow's tail instead of starting a second one.
    Modules stay unlimited.
12. **Error chip click** zooms out to frame all incomplete cards, flashes them red,
    and selects them.
14. tldraw's built-in **R/T/K/L/G/F/D/A/B tool shortcuts are disabled**.
15. **Module membership rule** — an unattached card dropped into a module frame is
    ejected back to the page (side effect + toast).
16. **Rename card headings** — double-click the title (or context menu → Rename);
    stored per-card as `label`.
17. **Right-click hardening** — the context menu resolves its target from the
    pointer when nothing is selected (covers module-frame interiors), with card /
    module / canvas menus.
18. **Grab the “Workflow” handle** on the run region to select the whole workflow
    and drag it anywhere.
19. **Modules inside workflows** — Open cards gained a flow input, so a workflow
    card can connect into a module's first card and the module's last card can
    continue out to the larger workflow; runs traverse straight through.
20. Canvas background is **#fefefe** (light theme).

## Batch 4 (2026-07-20) — omnibox rework (Astryx-inspired)

The omnibox was rebuilt around Meta's Astryx chat components (ChatComposer's
slot model + big-radius container, ChatToolCalls' tool-call rows):

1. **No header** — the panel is just the composer (plus, while the agent works,
   the transient objective + thinking area above it).
2. **Canvas/Browser segmented control moved back to the canvas's top-right**
   (floating; hidden in split view, where the browser sub-topbar's copy takes
   over).
3. **No chat window** — chat history, action groups, and the todo list are gone.
4. **Objective lifecycle** — type an objective → the agent builds the workflow →
   the objective is stored with date & time in the **Context right-sidebar**
   (Context drawer; persisted in `localStorage`, newest first) and cleared from
   the omnibox (with a toast).
5. **Attached context is stored too** — uploaded files, @-canvas context
   (selected cards / visible area), and Jira/ADO/Confluence/Notion links all
   land in the Context entry alongside the objective.
6. **Thinking messages** stream below the written objective while the agent
   works — Astryx-ChatToolCalls-style rows (`plan` / `add_card` / `connect` /
   `run` tool chips + target + real duration), a collapsible "N tool calls"
   summary, a spinner + shimmering text on the running row, and narration notes
   between calls.
7. **Footer** — left: plus, slash, @ (context). Right: maximize, circular ↑
   send (gradient; becomes ■ stop while generating). The context-library icon
   and the model dropdown were removed.
8. **Plus menu** — browser-mode toggle and the "All commands" section removed
   (slash covers commands); added **Jira ticket / Azure DevOps ticket /
   Confluence page / Notion page** pickers (mock lists, prototype) that attach
   as chips.
9. **The canvas toolbar is now horizontal and sits just above the omnibox** —
   a separate floating bar in the same bottom-left stack, so maximizing the
   omnibox pushes the toolbar up with it. Popovers/tooltips open upward.
10. **AI build shimmer** — the planner materializes cards and wires one at a
    time: each card pops in with a violet ring + shimmer sweep, each wire draws
    in as violet marching dashes with a glow, settling to normal once created
    (`aiBuildState` in `src/kane/uiState.ts`).

Bug fixed along the way: switching the plus menu between root ↔ submenu on
`mousedown` detached the clicked row before the document-level outside-click
handler ran, so `contains()` failed and closed the menu — the handler now
ignores events whose target is no longer connected to the DOM.

## Batch 5 (2026-08-05) — design system + motion stack

**1. Tailwind v4, no preflight, token bridge.** `@tailwindcss/vite`; `index.css`
imports `theme.css` + `utilities.css` as layers and omits `preflight.css`
(verified: zero preflight signatures in the build output). The bridge uses
**`@theme inline`** — load-bearing, not cosmetic: Kane's dark theme remaps
tokens on a *descendant* (`[data-kane-theme='dark']` sits on `.kane-app`, not
`:root`), so a plain `@theme` would resolve `var(--gray-900)` once at `:root`
and freeze every utility at the light value. The semantic shadcn names
(`--color-background`/`-foreground`/`-primary`/…) are additionally declared
**unlayered in both themes**, because Tailwind emits them at `:root` where
they'd freeze — and AI Elements' Shimmer reads `var(--color-background)`
directly rather than through a utility. Utilities sit in a cascade layer, so
unlayered Kane CSS always outranks them: adding Tailwind cannot regress an
existing surface.

**2. Motion** — spring card entry in `NodeShapeUtil` (with an `enteredCards`
guard, because tldraw culls off-screen shapes by unmounting them and the
animation would otherwise replay on every scroll-back); `AnimatePresence`
enter/exit on `PipelineRegions` keyed by sorted node ids. *Not* `layout`:
tldraw owns shape x/y as model state and writes region transforms imperatively
each frame, so `editor.animateShapes()` is the correct primitive for
downstream reflow.

**3. GSAP** (3.13+ — DrawSVG/SplitText/MotionPath are free on public npm;
verified present in `node_modules`) — wires self-draw with DrawSVGPlugin and
hand the stroke back to the marching-ants CSS on completion (both write
`stroke-dasharray`, so the handoff is explicit); `SplitText` per-word blur-in
on agent narration.

**4. Paper Shaders** — `MeshGradient` behind the canvas, `pointer-events:none`,
speed/palette shifting between generating and idle. The tldraw background sits
at 90 % opacity so it bleeds through as a wash while `#fefefe` still reads as
the canvas colour.

**5 + 12.1 + 13.3. Omnibox rebuilt on AI Elements `PromptInput`** — supplies the
composer shell, the **cmdk**-backed slash palette (item 5), and attachment
handling incl. global document drop and file constraints. Kane keeps the
objective → Context-sidebar lifecycle, linked Jira/ADO/Confluence/Notion
context, and maximize. Attachments render through shadcn's `Attachment`
(PromptInput owns the files but ships no display surface).

**6. NumberFlow** on the topbar runnable/incomplete/assertion counts and the
TOTP card's rolling code + countdown.

**7/8/10. Wire beats** — glow packet walked down the curve with
`getTotalLength`/`getPointAtLength` while a wire's destination card executes;
self-drawing stroke on creation; marching ants for the building state.

**9. Arrival staging** — one card at a time: card materializes → wire reaches
back and draws → beat → next. (A literal wire-*then*-card order isn't possible:
a connection binding needs a real target shape.)

**11 + 14. Card glows, split by state** — a rotating conic-gradient border on
cards the AI is materializing (registered `@property --kane-angle` typed as
`<angle>`; an unregistered custom property can't interpolate and would jump),
and Aceternity's proximity-driven `GlowingEffect` on settled cards for hover.

**12.2/12.3 + 13.1/13.2. Thinking panel** — AI Elements `ChainOfThoughtStep`
rows driven by the planner's step stream, `Shimmer` for the running row,
shadcn `MessageScroller` (autoScroll + anchoring) and a `Marker` status row.
The objective stays pinned above; only the thinking scrolls.

**12.2/12.4 follow-up.** `Plan` publishes the intended steps before building
(collapsible, streaming). `Checkpoint` marks "Workflow ready — N cards" in the
stream. `Suggestion` offers starter objectives while the composer is empty —
and since those mount as a batch, that is where Motion's **`staggerChildren`**
genuinely applies (canvas cards and thinking rows arrive one at a time from an
async planner, so their stagger is temporal, not variant-orchestrated).
`Queue` holds objectives sent mid-build and drains them when the current one
finishes — which required leaving the composer typable while generating, since
a disabled textarea made the queue unreachable.

`Task` + `Tool` power the **Steps list** right-sidebar panel (previously a
stub): every page-level card in execution order, as Task items wrapping a Tool
row with a status badge and the card's properties as expandable input. They
live there rather than in the thinking panel because `Tool` renders a bordered
collapsible card, which would have turned the approved compact step list into a
stack of cards.

`reasoning.tsx` was pulled and removed: it drags in `streamdown` + a duplicate
`shiki`, which conflict at the type level, and it renders streaming markdown
prose — not what Kane's panel shows. `Conversation`/`Message` are deliberately
not used: they render a chat transcript, which batch 4 explicitly removed.

**Card chrome.** tldraw draws shape indicators to a canvas for both the hovered
*and* the selected shape, with no per-shape DOM to target — so the blue outline
fought the proximity glow. `NodeShapeUtil.getIndicatorPath` now returns
`undefined` and the card draws its own `NodeShape_selected` ring, leaving hover
to the glow alone. The omnibox also carried two borders (the panel's plus
`PromptInput`'s InputGroup); the group's is stripped and the textarea gained
real horizontal padding. The Workflow region's grip icon was removed and the
Run pill's play triangle nudged 1.5px right to sit optically centred.

**Cards never stack.** `findFreeSpot` / `nudgeOutOfOverlap` in `graphOps.ts`
search outward (down, then up, then sideways) from a requested position until
the card clears every other card by 24px. Every toolbar / shortcut / slash
card asks for the *same* viewport centre, so without this they piled onto one
square; the planner and the recorder route through it too. Stamping a saved
module opts out via `keepExactPosition`, since its cards are laid out relative
to each other on purpose.

**Composer placeholder** cycles through example objectives every 3.6s while the
composer is idle, empty and unfocused — and freezes the moment it is focused so
it never moves under the user. **Maximize** had no CSS at all (the class was
applied but nothing acted on it, a leftover from the PromptInput rewrite); it
now widens the panel and gives it a 42vh writing area, with a `max()` floor so
a narrow viewport can't collapse it.

Bugs found and fixed while verifying:
- Aceternity's `pointer-events-none` is a Tailwind *utility* (layered), so
  unlayered card CSS outranked it and the glow overlay swallowed every click
  on a card — now overridden unlayered.
- `PromptInput` wraps children in an `InputGroup` with `overflow:hidden`,
  clipping the slash palette; lifted for this panel only.
- `BlurInText` deferred its split to `requestAnimationFrame`, so in a
  backgrounded tab (rAF throttled) the words would never appear at all —
  `useEffect` already runs post-commit, so the rAF is gone.
- The plus menu's root↔submenu swap detached the clicked row mid-`mousedown`,
  so the outside-click handler closed the menu; it now ignores targets that
  have left the DOM.

## Batch 6 (2026-08-06) — browser DevTools + multiplayer cursors

**Browser tabs + DevTools drawer.** The device tab bar is real now: multiple
tabs with per-tab URLs, a `+` to open one, and close buttons once more than one
is open. Below the viewport sits a Chrome-DevTools-style drawer with **Console**
and **Network** panes — level-coloured console rows with timestamps, a request
table (name / status / type / size / time) with a transferred-bytes footer,
plus a text filter and clear. **Detaching the browser into the floating window
auto-closes the drawer**, and the toggle is hidden there entirely, since the
popout is a small preview surface.

Console output is genuinely real: the mock page's `console.*` methods are
patched and every call (plus `window.onerror`) is forwarded to the drawer.
Network rows describe the page's own mock traffic — it issues no real
requests — so entries are emitted alongside the behaviour they represent
(document + css + js + `/api/session` on load, `POST /api/auth/login` on
sign-in, click beacons).

**Multiplayer cursors — real, between browser windows, with no backend.**
Every window joins a `BroadcastChannel` and publishes its cursor (converted to
*page* coordinates, so it lands correctly whatever each window's camera is
doing), camera and selection; peers are written into the store as
`instance_presence` records, which is what tldraw renders collaborator cursors
from. Open http://localhost:5180 in two windows and they track each other, each
with its own name and colour. Peers are heartbeated, reaped if a window dies
without a clean goodbye, and removed immediately on `pagehide`.

Scope, honestly: `BroadcastChannel` is same-origin and same-browser, so this
covers tabs and windows on one machine. Reaching another device or another
browser genuinely needs a server (tldraw sync / yjs) — but the record-writing
path here is exactly the one such a backend would feed. The document itself is
already shared across windows by tldraw's `persistenceKey`.

Two things worth knowing: the record type comes from
`editor.store.schema.types.instance_presence` rather than importing
`@tldraw/tlschema`, which is only a transitive dependency; and tldraw validates
that a presence `userId` is prefixed `user:` — without it every `store.put`
throws and no cursors appear.

## Batch 7 (2026-08-06) — chrome fixes + Variables + Credits

**Priority is a segmented control.** Three flat pills became one row with a
sliding tint. The indicator is a single element moved by Motion's shared layout
animation (`layoutId`), so it travels between segments instead of three pills
fading. The info popover widened to 276px so all three fit on one line.

**Test case identity.** A saved test case shows `TC-3342 · v4` next to the
filename and again, in full, at the top of the info popover. Both are gated on
`TEST_CASE` being non-null — a brand-new draft has no id or version and renders
neither.

**Browser tab icons.** Both were misaligned for the same reason: preflight is
off, so `<button>` keeps the UA's `padding: 1px 6px`, which inside an 18px box
leaves a 6px content column and pushes the glyph out of centre. Zeroing the
padding fixed the close ×; the + also needed `align-self: flex-end` with a 5px
lift to sit on the tabs' centre line instead of 5.5px above it. Verified: the
svg centre now matches the button centre to 0.0px on both axes.

**DevTools drawer resizes.** Drag its top edge between 132px and 460px, with a
proportional `min(460px, 62%)` ceiling so a short viewport can't let the drawer
swallow the page. Arrow keys (±16, ±48 with Shift), Home/End and a double-click
reset all work, and the drag uses pointer capture so it survives leaving the
handle.

**Omnibox maximize grows height only.** The width stays at its resting 340px so
the canvas beside it never shifts. Motion animates a `--omni-text-h` custom
property that the writing area reads as `min-height`, so the growth springs
rather than snapping — Motion writes CSS variables through the same path as any
other animated value (`buildHTMLStyles` routes any `--` key to `vars`).

**`/` opens the command palette.** Typing a `/` that starts a word opens the
cmdk list and focuses its search, so the next keystrokes filter it. Erasing the
token closes it again, and a slash inside a word (`3/4`) never triggers it.

**Topbar popovers stack correctly.** The topbar built a stacking context at
`z-index: 40`; the canvas column's mode cluster is also 40 and comes later in
the DOM, so it painted over the account menu no matter what z-index the popover
carried. The topbar now sits at 80 — above the drawer (50), the finder (70) and
the mode cluster, below toasts (100).

**Variables panel** (right bar, second position). Every Parameter / Secret /
TOTP Auth / Variable card in the session with its name and latest value. Once a
card has run, the value shown is the one the runtime registered — a resolved
`{{reference}}`, a generated code — tagged *resolved in last run*; until then
it's the authored value. Secrets and TOTP keys are masked behind a per-row
reveal toggle, and TOTP rows also carry the live code and its countdown.

**Credits** sit above the exit button, built on AI Elements'
[Context](https://elements.ai-sdk.dev/components/context). Its trigger *is* the
completion spinner — a ring that fills as the allowance is spent — and hovering
opens the breakdown. Context is built for a model's context window, but a
credit allowance has the same shape (a total, an amount used, a percentage), so
`maxTokens`/`usedTokens` carry them. The percentage label the trigger also
renders is hidden: the right bar is 52px and icon-only.

## Batch 8 (2026-08-06) — Reasoning, Task and Attachments in the omnibox

The run area is now three AI Elements components instead of one hand-rolled
list:

- **[Reasoning](https://elements.ai-sdk.dev/components/reasoning)** for the
  agent's prose. It owns the *Thinking… → Thought for N seconds* trigger and
  the collapse behaviour; the notes stream in as markdown.
- **[Task](https://elements.ai-sdk.dev/components/task)** for tool calls — each
  step a `TaskItem` with a status dot, the tool name, the target as a
  `TaskItemFile` chip, and its duration.
- **[Attachments](https://elements.ai-sdk.dev/components/attachments)** for
  staged files. `PromptInput`'s `files` are already `FileUIPart & { id }`, which
  is exactly `AttachmentData`, so they pass straight through; images preview
  from their blob URL and other types fall back to a media-category icon.

Both collapsibles keep their triggers **pinned** — Reasoning above the scroller,
Task wrapping it — because `MessageScroller`'s auto-scroll follows the newest
step and would otherwise carry both headers out of view exactly while they
matter. Only the step rows scroll.

The **Context panel** now shows an objective's attachments beneath it, as
Attachments in list variant with filename and media type. Blob URLs are kept in
memory but stripped before the log is written to localStorage — a few embedded
images would exhaust the quota and take the whole log with them — so a reloaded
entry falls back to its file-type icon.

Three fixes to the registry components on the way, all commented in place:

- `matchesAccept` in `prompt-input.tsx` compared `accept` patterns against the
  MIME type only. Kane passes extensions (`.pdf,.png,…`), which can never equal
  a MIME type, so **every attachment was being silently rejected** — by drop and
  by the file dialog. It now also matches extensions by filename, as the HTML
  `accept` attribute does.
- `context.tsx` read `usage.reasoningTokens` / `usage.cachedInputTokens`; `ai@7`
  nests those under `outputTokenDetails` / `inputTokenDetails`.
- `reasoning.tsx` shipped a `code` Streamdown plugin whose `@streamdown/code`
  pins shiki ^3 while this project's code-block component is on shiki ^4 — two
  copies with incompatible `BundledLanguage` unions. Reasoning content here is
  prose, never fenced code, so the plugin is dropped rather than forcing a shiki
  version onto a plugin not built for it.

`ContextTrigger` also gained an `iconLabel` prop: the ring is hard-coded to
announce "Model context usage", which is wrong when the meter is measuring
credits.

## Batch 9 (2026-08-06) — Code panel, auto-save, run steps

**Code panel** (right bar, third position). Explains what generation does,
picks a language and framework, and writes the test out inline.

`src/kane/codegen.ts` walks the canvas in **execution order** — following
connections from the starting card, not left-to-right position — turns data
cards into variables and everything else into statements. Emission is a small
syntax profile per target (imports, test wrapper, one template per card type),
so JavaScript/TypeScript × Playwright, JavaScript × Selenium/WebdriverIO,
Python × Playwright/Selenium, Java × Selenium and C# × Selenium all produce
genuine code rather than one language with the keywords swapped. Card targets
are natural language ("“Sign in” button"), so the emitted locators are
text/label locators built from that phrase — no selector is invented that the
canvas doesn't contain. Variables are deduplicated by name (the runtime lets a
later card win, and declaring the same `const` twice wouldn't compile).

Generation lives in `KaneAppContext`, not the panel, so **closing the drawer
doesn't cancel it** — the right bar's Code button swaps its icon for a progress
ring and reports the percentage while you keep working on the canvas or in the
browser.

**Stale code.** `canvasSignature()` fingerprints exactly what the code depends
on: variables and steps, not positions. Moving a card leaves the code valid;
changing what a card *does* flips a banner with a Regenerate action. Verified
both ways round.

**Variables search and filter.** Text search across name, value and type, plus
type chips carrying counts. Masked values are still searchable — the point is
finding the row, not reading the secret out of the results.

**Priority is a dropdown** now, opening on the current value, no icons.

**No theme toggle, no Save draft.** Every change is saved as it happens and the
topbar says so: *Auto-saving changes* → *Changes saved*, driven by a
`store.listen({ scope: 'document', source: 'user' })` subscription so canvas
edits count and camera moves don't. With the toggle gone the app always starts
light — honouring a previously-saved `dark` would strand anyone who had toggled
it, with no way back.

**Run steps.** This test case already exists (it has an id and a version), so
the primary action is running it, not creating it. `getRunCursorTarget()` was
lifted out of `RunCursor` and is now shared, so the topbar button and the play
button on the Run label resolve the starting card through the same function —
they cannot disagree. It becomes Stop while a run is in flight.

**Placeholder types itself.** A GSAP timeline tweens a character count, so the
type-in and the erase keep their own easing instead of both marching at one
fixed interval. It stops the moment the composer is focused or has text, and
reduced motion gets a static hint.

## Batch 10 (2026-08-06) — variables table, status, and polish

**Drawers close as smoothly as they open.** They were animated in by a CSS
keyframe and then just unmounted, so closing snapped. Motion's `AnimatePresence`
now keeps the panel mounted through an exit spring.

**Priority was genuinely broken, and the cause was interesting.** Radix renders
select content in a portal on `<body>`, so clicking an option is "outside" the
info popover by DOM containment — the popover tore itself down mid-selection and
swallowed the change. (It passed an earlier scripted test because a synthetic
`.click()` skips the `mousedown` that did the damage.) `useOutsideClick` now
treats anything inside a portalled layer as belonging to the popover. Selecting
a value no longer closes the popover either — that's the user's call.

**Status** joins priority in the popover: ready / live / unverified / faulty /
archived, each tinting its trigger.

**Variables is a table now**, in an 870px drawer: underline nav across
Variables / Parameters / Secrets / Smart Variables / TOTP Variables, search,
Add new, and columns for key, scope, initial value, session value, copy, locate
and a ⋯ menu with Edit and Delete.

Every row *is* a card on the canvas. Editing a key or value writes straight to
the shape, **Add new** drops a real card and opens its row for inline editing,
and Delete removes it — there's no second store to drift out of sync. Both
inline fields write through on each keystroke rather than on blur, so an edit
can't be lost when the row leaves edit mode by another route.

**Smart Variables** is derived, not stubbed: it lists every `{{reference}}` used
somewhere on the canvas that no data card defines — the values a run has to
supply itself — with the card that wants it.

**Credits** now breaks down as *Infra.* (session time in mm:ss × per-minute
rate) and *Steps* (card count × per-step rate). The ring's consumed arc is blue
and its stroke matches the 2px lucide stroke of the other sidebar icons; the
component gained a `--context-used` hook so a host can colour the arc apart from
the track.

**Smaller things.** Portalled layers (the omnibox `@` and `+` menus, the credits
card, select menus) drop from a `--gray-200` border to `--gray-150` and lean on
their shadow instead. Modules trades its stacked-boxes icon for a plain package.
The omnibox sends with a rocket. The placeholder holds each example 4.5s instead
of 1.6s. Pressing `/` anywhere focuses the composer without inserting the slash,
unless you're already typing in a field. The code drawer drops its explanatory
copy, leads with Framework, and offers a download beside copy once the file is
written.

## Batch 11 (2026-08-06) — Text Inspector, run-follow, validated variables

**Text Inspector** in the browser toolbar, in the spirit of mesurer.dev. Toggle
it on and hovering outlines the text element under the pointer; clicking picks
it *instead of* interacting with the page (the click is swallowed in the
capture phase). The panel reports what the text is actually rendered with —
element, box, font, weight, size, line-height, letter-spacing, align, colour,
transform — plus a derived CSS path you can copy, and **Assert this text**,
which drops an If/Else card checking that text is on the page.

**The running card stays in view.** With the browser docked the canvas is only
a few hundred pixels wide, so a run walks off-screen within a couple of steps.
`FollowRunningCard` pans to follow `currentExecuting`, but only when the card is
actually near an edge, and it never touches the zoom. Verified: the camera
stepped through four positions as the run advanced, with `z` unchanged.

It pans instantly rather than easing when `document.hidden` — an eased pan is
rAF-driven, and a backgrounded tab would freeze it mid-flight and leave the
wrong part of the canvas showing when you came back.

**Variables rows are validated.** Editing is now a draft with **Save** and
**Cancel** in the row: Save commits, Cancel discards, and cancelling a row that
"Add new" created deletes the card it made, so nothing is left behind. Save
stays disabled until the row holds something usable, with the reason shown in
the row — name required, identifier-shaped, not already taken, value required,
and for TOTP a real base32 key of sensible length. An empty tab drops its table
header and shows only the empty state.

**Every prompt in Context carries its work.** Objectives now file the agent's
plan, prose and tool calls alongside them, all folded away — the objective line
is the entry until you ask for more.

**Toast severity was wrong across the board.** Every toast rendered a red
warning triangle inside `role="alert"`, so "Objective saved to Context"
announced itself as a problem. Toasts now carry a tone: success (green check,
`role="status"`), info (blue), error (red triangle, `role="alert"`), and all
sixteen call sites were classified.

**The Run label's play icon, properly this time.** The nudge it had was
compensating for the wrong thing: `.RunCursor-play` is a `<button>`, and with
preflight off it kept the UA's `padding: 1px 6px`, leaving a 6px content column
for an 11px glyph. Padding zeroed; the remaining 0.6px offset is the real
correction — a triangle's centroid sits 1.33 of 24 units left of its
bounding-box centre. Measured: 0.3px from centre horizontally, 0.0px vertically.

**Framework and language logos** are the projects' own marks, and which CDN
serves each was checked rather than assumed: Simple Icons 404s on `playwright`,
`java` and `csharp`, so those come from devicon; the rest use Simple Icons with
an explicit brand colour. (`sharp` resolves on Simple Icons but is the image
library, not C# — worth knowing before reaching for it.)

**Smaller things.** Credits ring stroke up to 2.75 — a 20px ring reads lighter
than a 19px lucide glyph at the same nominal weight. Modules uses a stack icon
everywhere it appears (right bar, canvas toolbar, contextual toolbar, slash
menu), not just the one place. Priority and status dropdown values are neutral
again; colour-coding five statuses turned the popover into a traffic light.

## Batch 12 (2026-08-07) — network detail, persistent omnibox, demo pacing

**The omnibox no longer clears itself.** A finished run used to be wiped 1.5s
after the last card landed, which meant the thinking and the step list vanished
before anyone could read them — and left no clue that they had been filed
anywhere. The run now stays on screen behind a "Saved. Every prompt, with its
thinking and steps, is kept in the Context tab." bar carrying **Open Context**
and **Clear**. Sending the next prompt clears it automatically.

Two things had to be fixed to make that safe. The queue guard treated *any*
`run` as work in flight, so a second prompt would have queued behind a run that
had already finished and never drained; `RunState` gained a `done` flag and the
guard now only queues while something is actually building. And `BlurInText`
turned out to be unable to change its text at all: GSAP SplitText replaces the
element's children with per-word spans, so React was updating a text node no
longer in the document, and the effect cleanup then reverted the element to the
*previous* words. It never showed before because the run area unmounted between
prompts. The effect now writes the text in itself before splitting.

Keeping the run visible also broke the panel's height cap: PromptInput wraps its
children in an InputGroup that sizes to content, so `max-height` on the panel
never reached it and the composer's own footer was pushed past the bottom of the
window. The wrapper can shrink now, and the run area scrolls.

**Network requests open like Chrome's.** Clicking a row in the Network pane
collapses the list to its Name column and opens a detail pane with **Headers /
Request / Response** tabs. Headers carries General (Request URL, Method, Status
Code with its text, Remote Address, Referrer Policy), Request Headers with the
HTTP/2 pseudo-headers and the fetch-metadata set, and Response Headers sorted
alphabetically the way Chrome sorts them. Request shows query-string parameters
and the payload; Response shows the body.

The mock page reports only what it actually knows — method, url, status, type,
size, timing, and the JSON a call sent or returned. Everything else is
reconstructed in `browser/netDetail.ts` as pure functions of the entry, so a
re-render never reshuffles a request id or a remote address. Asking the page to
spell out twenty headers per request would have buried the behaviour it exists
to demonstrate.

**Demo pacing** lives in one constant. `utils/pace.ts` exports `DEMO_PACE` and
`paced()`, and every simulated delay — card materialisation, wire draw, planner
thinking, and each node's execution — runs through it. It is set to 1.9: the
prototype is shown to a room, and a step that finishes in 200ms is over before
anyone has found it on screen. One knob turns the whole demo up or down.

**Kane's tooltip replaces the browser's.** `kane/Tooltip.tsx` wraps a control and
renders the same dark pill the right bar has always used, with a rest delay, a
`role="tooltip"`, and automatic clamping when a tip would hang off the edge of
the window. It is now on every topbar control and on the Text Inspector, Inspect
(DevTools) and popout/dock icons; no native `title` is left in either bar.

Centring uses the independent `translate` property rather than `transform`,
because the shared `pop-in` entrance animates `transform` — which would override
the positioning for its whole 140ms and drop the tip half a width off its
control. That bug was already there on the right bar's tooltips.

**Table rows are one height.** The Key column in the Variables table was
`display: flex`, which took the cell out of table layout: it stopped stretching
to the row and painted its bottom border ~9px above every other column's, so a
row read as two different heights. It is a table cell again, and both tables now
give their rows a fixed height, so an editing row (28px input), the last row
(which drops its bottom border) and a plain text row all measure the same.

**Smaller things.** Modules uses lucide's `Layers` everywhere. Library modules
show their version, whether they run unattended, their folder and when they were
last saved, in a slightly wider drawer. Context cards stamp `Aug 07, 2026, 03:45
PM` — pinned to en-US, because the format is a product decision rather than the
visitor's locale — and each carries a **Reuse** button that pastes the prompt
back into the omnibox. The Context panel gained a **Clear all**, and its storage
key was bumped so everyone starts with an empty log. Double-clicking the canvas
no longer drops a text shape (`createTextOnCanvasDoubleClick: false`), and the
canvas context menu is rebuilt from tldraw's own pieces without the conversions
group — "Copy as" and "Export as" only ever produced the wrong kind of file for a
test workflow. Credits popover separators were falling back to `currentColor`
(near-black) because preflight is off; Tailwind's `divide-y` draws them as a
*bottom* border, which is what the fix had to target.

## Batch 13 (2026-08-07) — explicit versions, controls into the omnibox

**Saving is explicit again.** A test case is a versioned artefact, so auto-save
was the wrong model: it produced a stream of unlabelled versions nobody asked
for. Save is a secondary button after Run steps; it opens a small composer for
the message that version carries, shows the bump it will make (`v4 → v5`), and
stays disabled until the canvas is actually ahead of its last save. ⌘↵ commits.
The version number is derived from the saves made this session rather than kept
as its own state, so there is one source of truth. Share sits before Run steps
with the test case's link.

**Every control now lives in the omnibox.** The Canvas/Browser switch moved into
the footer between maximise and send, icons only, and the omnibox widened to
384px to hold it. That also fixed the popped-out browser: as a floating overlay
at z-index 40 the old switch sat **on top of** the window's title bar (38) and
swallowed every drag that started on its left two-thirds. Confirmed by hit-test
— the pointerdown was landing on `seg-btn`, not the title bar.

The drag itself no longer goes through React. Committing a position on every
pointermove re-rendered the whole browser surface — sub-topbar, tab strip,
iframe — and `left`/`top` made each of those a full layout pass. The handlers
write `translate` straight to the element and state is committed once, on
release; bounds are read once, at the start of the gesture. Position rides on
`translate` rather than `transform` because `window-in` animates the latter.

**The canvas toolbar is now a reveal.** It sits above the omnibox, out of flow
so the composer never moves, and grows out of the composer's top edge while the
omnibox has focus. The trigger is `:focus-within` on the stack, not React state
on the textarea: pressing a toolbar button moves focus onto that button, and a
state tied to the textarea alone would tear the toolbar down mid-click. Select
is gone — the canvas is always on the select tool — and Beautify wears an
alignment icon.

**Javascript and API are real cards**, not menu entries. Both carry a flow pair
plus a value output, so an If/Else downstream can assert on a status code or on
whatever a snippet returned; the JS card registers its result under a name later
cards reference as `{{name}}`. An API card's request is announced to the runtime
like any browser action, so it appears in the Network pane alongside the page's
own traffic. The slash palette is grouped accordingly: Data (the four variable
cards) · Interact · Flow · Code · Reuse.

**Two bugs worth naming.** The automated/non-automated chip was classed
`.m-auto` — which Tailwind also generates as the `margin: auto` utility, so the
chip got an auto margin on *both* sides and sat centred in the leftover space
instead of against the right edge, landing 34 / 31 / 13 / 13px from it across
four rows. Renamed, now flush at 0 on all four. And the module row rested on
`border: 1px solid transparent` — transparent *black* — so hovering interpolated
through dark low-alpha greys and the border smudged in rather than fading. It
rests on the hover colour at zero alpha now.

**Smaller things.** The topbar wears the KaneAI goggles mark instead of the
lettered tile; it is drawn inline so it inherits `currentColor`. The Aceternity
proximity glow is off the cards — it read as a state the card was in, and on a
dense canvas it fired constantly; every other gradient is untouched. The credits
ring is 3px and its popover numbers roll with NumberFlow.

## Batch 14 (2026-08-07) — Inspector, and five pages worth inspecting

**Inspector** replaces Text inspector. It picks *any* element, not just ones
carrying text: hovering outlines whatever is under the pointer, and clicking
opens a popup with that element's properties and a box to write an AI prompt
against it. Submitting makes an **AI step** card holding three things — the
prompt, a readable name for the element, and its XPath. The XPath is what lets
the card find the element again after a re-render renames every class.

Picking is not interacting: the click is swallowed, and so are mousedown,
mouseup, dblclick, submit and keydown, so choosing a toggle doesn't flip it.

**Agentation supplies the popup, not the toolbar.** `agentation@3.0.2` exports
`AnnotationPopupCSS` and the element-identification helpers separately from its
`Agentation` toolbar, so the toolbar is simply never mounted — no CSS
suppression, no fighting a second floating UI. Verified: with the popup closed
there are zero agentation nodes in the document.

The picked element lives in the mock page's iframe, which is `srcdoc` and so
shares the app's origin — the helpers run against the real node rather than a
description of it. The page tags its pick with `data-kane-picked` and the parent
looks it up; posting a selector and re-querying would be ambiguous the moment
two elements share a class. Where agentation falls back to a bare tag name — a
toggle becomes "span" — the page's own label (`aria-label`, `data-kane`,
placeholder, alt) wins, so cards read as "in stock only" rather than "span".

Its popup is `position: fixed` and centres itself on the `left` it is given, so
the anchoring math works in viewport coordinates and clamps to the browser pane;
a pane shorter than the popup falls back to clamping against the window instead.

**Five sample pages** — `shop`, `docs`, `dash`, `account` and `status`, all on
`*.demo.test`. A new tab opens one at random, and they are reachable by name from
the address bar. Between them they cover long scrolls (~3000px each),
breadcrumbs, headings, icons, skeletons that resolve into content, card lists,
grids, dropdowns, buttons, text fields, checkbox and radio groups, toggles,
coloured elements, inline artwork, dialog modals, links, spinners, progress bars
that actually move, popovers, and tooltips on both hover and click.

The PDF downloads are real: the page assembles a valid PDF at click time, xref
offsets computed against the actual object positions, rather than shipping a
base64 blob nobody could verify. Confirmed: 636 bytes, `%PDF-1.4` header,
`%%EOF` terminator.

**Two bugs worth naming.** The sample behaviour script is appended straight after
the page's main IIFE, and `})()` followed by `(function(){` on the next line
parses as *calling* the first IIFE's return value — the whole block died with
"(intermediate value)(...) is not a function" and every modal, toggle and
download silently did nothing. A leading semicolon fixes it. Separately, an
element's transparent background was being reported as `#000000`; every unstyled
background is `rgba(0,0,0,0)`, and calling that black is a lie.

> **Licensing:** agentation is **PolyForm Shield 1.0.0** — source-available, not
> open source. It permits use except to build something competing with the
> licensor. Worth a legal read before this ships in a product, since agentation
> is itself an AI-annotation tool.

## Batch 15 (2026-08-07) — resizable cards, a scroll step, and cards you can hand back

**Only what can go there.** The `+` on a wire used to offer the four data cards,
none of which has a flow input — choosing one bailed silently and closed the menu
as if it had worked. The picker now filters by what the wire actually carries, and
a wire that admits nothing (a value wire feeding a field) loses its `+` entirely
rather than opening an empty dialog. The check depends only on the pair of port
types at the wire's ends, so it is worked out once per pair and cached —
`getOverlays()` asks it for every connection on screen, every frame.

**Send a card back to the AI.** ✨ on the contextual toolbar opens a small composer
under it; the instruction is applied to the card with the AI-building shimmer, and
a toast says what changed. `src/agent/refine.ts` is a deterministic stand-in in the
same spirit as `planner.ts`: it reads the instruction for the things a step can
actually be changed to (click type, repeat count, hold duration, iteration caps,
break/continue conditions, methods, URLs, bodies, snippets, scroll amounts) and, if
it recognises nothing, says so rather than editing a field at random.

**Scroll card** — direction, an amount in % or px, and the container. No slash
command: a scroll only means something against something that scrolls, and both
ways of knowing what that is already exist — scrolling with Record on (the page
reports the element that actually moved, which is what the `detected` chip means)
or asking for one in the omnibox. The container and the amount are shown as one
sentence, *Scrolls **down 60%** of **#results-list***, with each half a button that
focuses the field behind it.

**While** grew a Continue-if and a Break-if condition, both optional, and the same
`nl` / operand-operator-operand modes If/Else has. Break gets its own outgoing
branch so an early exit can run a screenshot or a cleanup step; if nothing is wired
to it, control leaves through Done as it always did. **Loop vs Done**: Loop is the
body — it runs once per iteration and is where the repeated work hangs. Done is
what comes after the loop ends. Both are needed because they are two different
continuations: without Loop the loop repeats nothing, without Done the test has
nowhere to go afterwards.

**Resizable cards** (If/Else, While, Javascript, API). A corner grip writes `w`/`h`
onto the node; the minimum is the card's natural size, so no drag can hide a row.
Cards whose rows are all of a kind share the extra height evenly — and the ports
divide the body exactly the same way, so a resized While still has Break, Loop and
Done sitting on their rows. Double-clicking the grip returns the card to its
natural size. Verified at 380×460: ports at y=216/350/417 against a computed
67px row height.

**Click** gained a repeat count and a Hold type with a duration; each repeat is its
own action so the page animates every one, and a hold keeps the ring on for as long
as the button is down.

**The Javascript card is now one editor** — line-number gutter, VS Code Light+
colours, Tab indents. The two single-line fields are gone: a code box you couldn't
read a line of was the worst possible place to write code. A single left-to-right
tokenizer, so a keyword inside a string stays a string. The result is published on
the `result` port; the old "Save as" name is still honoured on documents that have
one, but nothing writes it any more.

**Save drafts its own commit message.** The canvas is fingerprinted at each save and
diffed against it on the next one: *"Add Open page, update Click and remove AI step
— 139 steps in the flow"*, pre-selected so typing replaces it.

**Inspector**: the "click any element" hint moved out of the page and into the
browser's own chrome, as an info bar under the tab strip — the way Chrome announces
it is being driven by test software. The element popover opens with its properties
already expanded and can be dragged anywhere; the drag is written to `left`/`top`,
never `transform`, because agentation's enter and shake keyframes own that property.

**Also**: the AI step card shows the captured XPath as a read-only row (clipped from
the left, so the identifying tail stays visible); the credits ring is 3.5; the
omnibox's send button, maximize button and mode control are all 30px; and the `+`
menu is grouped — local files, then Jira / Azure DevOps / Confluence / Notion as
submenus of recent items, each with its real brand mark (Simple Icons for three,
devicon for Azure DevOps, which Simple Icons doesn't publish).

**Two bugs found while testing.** A refine that matched several rules applied only
the last one: every rule was writing from the same captured shape, so each update
clobbered the one before it. Each rule now reads the card back first. And pointer
capture taken on `pointerdown` in the popover drag made the whole popup the click
target, so the header toggle stopped working — capture is now taken only once the
pointer has actually moved past the drag threshold.

**Still not covered:** the code panel emits open / click / input / if-else / while
only. Scroll, Javascript, API and AI step cards are skipped there, as they were
before this batch — adding them means an emitter in each of the eight
language/framework profiles.

## Batch 16 (2026-08-09) — the cards, to the design

Six cards rebuilt from supplied designs, on a card shell that is now the same
everywhere.

**The shell.** Run and Ask-AI moved off the contextual toolbar and into the
card's own header, where they read as things the card *does*; the toolbar is
left for things done *to* it — settings, duplicate, delete. Every per-type
control that used to hide there (click type, iteration count, add-else-if) is on
the card now, readable without selecting anything.

**Ports by direction.** Everything a card takes in is orange, everything it
hands on is blue. Which way a connection runs is the thing you read a graph by,
and it is the same question on every card — where the *data type* only matters
while you are dragging a wire, which the eligible-port highlight already
answers.

**A tab panel under the body.** Settings — failure behaviour and timeout — is
always reachable from the toolbar's gear. Screenshot and Thought appear once
there is a run to show, and a finished run opens the panel on Screenshot. The
panel's height is part of the shape's geometry rather than an overlay, so wires
below a card route around it instead of being covered; the component is given
the same number the geometry used, so the two cannot drift.

Every card now records what its last run did — how long it took, which page
view, what it targeted, and a sentence of narration — which is what those two
tabs draw from. It replaces the old `lastShot` screenshot strip; that field
stays in the validators, unread, so older documents still load.

**The six cards.** Click: an element *field* (what gets clicked is described in
words, and a description that has to fit on one line stops being one) and five
types — Single, Double, Multiple, Right, Hold. If/Else: a condition field and a
branch port per block, an in-card ⊕ ELSE IF, and Else. While: WHILE, MAX with a
stepper, LOOP and DONE. Input Box: ELEMENT, TEXT, and the Enter checkbox. Scroll:
ELEMENT, four directions, VALUE with %/px. AI step: PROMPT, ELEMENT, and the
XPath.

**Break and continue are gone from the While card** — model, runtime, refine
rules and the version diff. Removing a field from a card means removing it from
what is already saved, so there is a tldraw props migration that strips them;
without one the validator rejects the whole document and the canvas comes up
empty. (Adding fields never needs a migration here: every field a card gained is
optional.)

**The XPath is shown whole**, broken one step to a line. Breaking wherever the
character count runs out splits `[@class="…"]` down the middle; breaking at the
`/` is how anyone reads one anyway, and it makes the line count something the
card's geometry can know rather than guess.

**Three things worth naming.**

`white-space: nowrap` is inherited into that locator row, so the first version
ran long steps off the edge of the card instead of wrapping — the exact failure
the change was meant to prevent, and invisible at a glance. It has to be set
back explicitly.

Click's TYPE row is five options wide already; the number that Multiple and Hold
need overflowed the card by a measured 142px, so it gets its own row.

And a warning for anyone verifying from a script: the preview pane reports
`document.visibilityState === "hidden"` and fires **zero** rAF frames while it
is being driven, so Motion springs never advance and a card created from the
console stays frozen at its entry state — `scale(0.92)`, invisible. Every height
measured off one is 8% small. Two hours went into a "gap" that was only ever
that transform.

## Batch 17 (2026-08-09) — pausing a run, one blue for every wire, and a handle that is a handle

**A run can be held.** `Run steps` is the same button all the way through:
Run steps → **Pause** → **Resume**, the label morphing between the three rather
than being swapped (both labels share one CSS grid cell so the outgoing one
fades out under the incoming one, and Motion's `layout` springs the button's
width). Stopping is a different question and gets its own square button beside
it while a run is going.

The pause reaches two places (`src/execution/runControl.ts`). The scheduler
won't start the next card while it is set — but a step here is deliberately
slow, so that alone would leave Pause feeling broken for a second or two. Every
wait *inside* a step goes through `runSleep` as well, which is what makes a
pause land roughly when it is pressed. Verified: paused on Click and held there
across 4.5s of sampling, then Resume carried it through If/Else → Open page →
Input Box.

**Every wire is blue**, in or out. Colouring by data type made a value wire read
as a different kind of thing from a flow wire, when the only useful question
about a wire here is which way it runs — and the ports at either end already
answer that.

**The Inspector popup is text again.** Making the whole popup a drag handle cost
the thing it exists for: you cannot select an XPath to paste into a locator if
every pointer-down might become a drag. There is now one 20×20 grip in its
top-right corner, and nothing else moves it. The grip needs no measuring — the
popup is `position: fixed`, centred on `style.left` and starting at `style.top`,
so its box is exactly `left ± 140`. Verified with a real triple-click: selects
`element: h1;` and the popup stays put.

**Tooltips are portalled to `<body>`.** The three on the browser sub-topbar were
losing their last words to 44px of `overflow: hidden` on `.kane-work` — measured
right edge 1272 against a clip at 1228. A tip positioned as a sibling of its
control is at the mercy of every ancestor between them, so `<Tip>` now renders
into the document body at measured viewport coordinates and no box on the page
can cut it.

**The Click card is 360 wide.** Five click types on one segmented control
measure 255px; with the 62px TYPE label, the gap and the padding that is 349px
of card, against the 260 it had. The control ran 77px past the card's right
edge.

That fix has a tail. Every card on a saved canvas was placed when a card was one
width, at a 320px pitch — so a 360px Click card lands 40px under its right-hand
neighbour, and the last option ends up hidden by the next card instead of by the
card's own edge. So: the planner and the tidy-canvas layout now step by the
card's real width, and `separateOverlappingCards` runs once at mount to push
apart anything already overlapping (only ever rightwards, only page-root cards,
a no-op when nothing overlaps). 29 overlapping pairs before, 0 after.

**Ports sit on their rows again.** A resizable card gave every row an equal
share of its height, which is only right if the rows are all of a kind — If/Else
and While mix 78px fields with 44px one-liners, so each port sat a little off
the row it belonged to, by more the more rows there were: 5px on a one-branch
If/Else, 11px on a six-branch one. Long-form fields flex now and one-line rows
keep their height, which is exactly what `getPorts` assumes. Measured after:
DOM row centres and port positions identical at 1, 3 and 6 branches.

Also: **⊕ ELSE IF disappears** at the cap of five rather than sitting there
greyed out (and the Else port moves up by the row it no longer has); **`&&` in
the If/Else and While headers** toggles the condition to operand · operator ·
operand and becomes a pencil-sparkles to toggle back; a card header's **▶ moves
the Run label onto that card** before it starts, so the label never claims a run
would begin somewhere it wouldn't; the **Workflow chip and its dotted outline
are off the canvas** (the component is still in `components/PipelineRegions.tsx`,
simply not mounted); and the Save popover's "Drafted from what changed" caption
is gone — the drafted text still fills the box.

One more for the script-verifier: the pane's frozen rAF (see batch 16) also
stops **tldraw store listeners** flushing and **Motion exit animations**
completing, so `Save` reads as disabled after a change and all three morph
labels sit in the DOM at once. Neither is real. Take a screenshot to un-freeze,
then read. And `left_click_drag` does not synthesise pointer events at all —
dispatch `PointerEvent`s directly to test anything drag-driven.

## Batch 18 (2026-08-09) — the locator's tail, the card's own composer, and a version history

**The XPath is one line again, cut at the front.** `…/button[@class="btn primary
submit"][1]` — the end of a locator is what identifies this element, the front
is the boilerplate every XPath on the page shares. `direction: rtl` moves the
ellipsis to the start; an inner span forced back to `ltr` with
`unicode-bidi: bidi-override` stops the slashes and brackets being reordered,
which is what the bidi algorithm does to a path in an RTL context if you let it.
The whole value stays in the DOM, so the copy button and the tooltip give you
all 100 characters. The row is a plain 44px again and the locator port sits on
its centre — measured at 192 against a port at 192.

**A card's ✨ opens a composer beside the card.** Same composer as the omnibox:
the same `+` menu (now one component, `agent/AttachMenu.tsx`, so the two can
never drift into offering different things) and the same rocket. Two lines,
`resize: none`. It is drawn on the canvas overlay in viewport pixels rather than
inside the card — a composer that shrinks with the camera is unreadable at the
zoom people work at — and it follows its card, flipping to the card's left when
there is no room on the right. Verified: opens 14px from the card, top-aligned,
320 wide; the `+` menu lists Attach / Files / Jira / Azure DevOps / Confluence /
Notion; sending renamed the card and closed the popover.

**Versions, in the right bar.** Every version of the test case, newest first,
each with its number, `MMM DD, YYYY, HH:MM AM/PM` and who saved it. Clicking one
opens what it was saved with; the pencil renames it, and the original message is
kept underneath — a version's *name* and the message it was cut with are two
different things, and renaming shouldn't lose the second.

The history is seeded with v1–v4. A version list that starts empty says the test
case was created a moment ago, when the topbar has been saying v4 all along; the
seeded dates count backwards from load so the list reads sensibly whenever the
prototype is opened. The current version number is now read off the newest entry
rather than counted from a base, so saving v5 moves the topbar badge, the Save
popover's `v4 → v5` and the drawer's "Current" chip together. Signing in as
someone is now one fact (`CURRENT_USER`) rather than an `AB` hardcoded into the
avatar.

⚠️ Clicking a version opens **what was saved with it**, not the canvas as it was
then. Restoring a past canvas would need a full document snapshot per version,
and the four seeded ones have no canvas to restore — so rather than have the
control work on some rows and not others, it shows the version's detail on all
of them. Say the word if you want real canvas restore for versions saved in the
session.

## Prototype notes (no backend)

- The tldraw **agent template requires a Cloudflare worker + LLM API keys and has no mock
  mode**, so this build keeps its chat UX/architecture (streamed actions, todo list,
  interrupt/stop) but drives it with a **deterministic client-side planner**
  (`src/agent/planner.ts`) — objectives matching login/search/checkout/loop patterns
  produce tailored workflows; anything else gets a generic open→interact→assert chain.
  Swapping the planner for the real agent backend is a contained change.
- The browser is the same **`srcdoc` mock app** approach as last time (never blocked by
  X-Frame-Options), now with a postMessage bridge: workflow runs animate cursor moves,
  ripples, typing and navigation in the page; page interactions post back as recorded steps.
- TOTP codes, condition evaluation and step execution are deterministic mocks.

## Layout map

| Area | Files |
|---|---|
| Shell + split/popout wiring | `src/App.tsx` |
| Chrome (topbar, right bar, drawer, toasts, mode cluster, canvas toolbar) | `src/kane/` |
| Omnibox (objective composer + thinking steps) + planner | `src/agent/` |
| Cards | `src/nodes/types/` (registry: `src/nodes/nodeTypes.tsx`) |
| Ports / connections / execution | `src/ports/`, `src/connection/`, `src/execution/` |
| Browser (chrome, popout window, mock page) | `src/kane/browser/` |
| Minimap / contextual toolbar / graph ops | `src/kane/KaneMinimap.tsx`, `src/kane/KaneContextualToolbar.tsx`, `src/kane/graphOps.ts` |
| Styles (Kane tokens + tldraw overrides) | `src/index.css` |

License note: template code is MIT; the `tldraw` dependency shows its “Made with tldraw”
watermark unless a business license is added.
