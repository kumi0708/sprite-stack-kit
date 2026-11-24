---
name: check-your-work
description: "How to verify a change to a sprite-stack-kit game: the headless checks (bun run check, bun test), saving and looking at frames (bun run snapshot), trying the game in a browser, measuring frame time, redrawing the documents' figures, and adding a check for a new feature. Use before saying any change to a game is done, when a frame looks wrong, when something is slow, or when adding a feature that needs its own check."
---

# Checking a change

A game can run without errors and still be wrong: a blank band of sky, a craft drawn behind a hill, steering that works in one view only. Check with the tools below before you report a change as done.

Run them from the kit's folder, the one that holds `scripts/check.mjs`. If the project has none, the `sprite-stack-game` skill says how to get it. `check`, `states` and `snapshot` take `--game <folder>` for a game other than the starter.

## 1. Run the checks

```sh
bun run check
bun test          # the same checks through Bun's test runner, and the tools' own tests
bun run states    # only the walk of the game's states
```

They run the game with no browser and take a few seconds. Each line of output is one promise, written as a plain statement, with `ok` or `FAIL` in front. `check` includes the walk as one line. The walk tries every order of the player's steps against the rules in the game's `states.js`; the `verify-states` skill explains it.

## 2. Look at frames

```sh
bun run snapshot
```

This writes PNG files to `snapshots/`. Open them and look. If you can read images, read them yourself.

| Option | Effect |
| --- | --- |
| `--view top,chase,cockpit,between,entering,apart` | Which frames to save. `between` is half-way from overhead to chase. `entering` is half-way from chase into the cockpit. `apart` pulls the slices apart |
| `--seed 3` | A different world |
| `--seconds 6` | How long to fly before the frame is taken |
| `--turn 1` | Hold a turn (−1 to 1) |
| `--climb 1` | Hold a climb or a dive (−1 to 1) |
| `--boost` | Hold the thrusters |
| `--width 480 --height 270` | Frame size |
| `--scale 3` | How much to enlarge the saved image |
| `--option level=2` | Passed to the game's `createGame()`, for games that take their own options |
| `--out some/folder` | Where to save |

What to look for:

- **Empty or single-colour bands.** The sweep stopped early or started late.
- **The craft missing or sliced.** A depth test is wrong, or the draw order changed.
- **Holes in the craft.** Seams between cells.
- **Stripes or shimmer in the distance.** The depth step is too coarse.
- **Colours that are off.** A palette index points at the wrong row.
- **The `between` and `entering` frames.** Each should look like a normal picture from an odd angle.
- **The cockpit with `--turn 1`.** The horizon, the head-up display and the attitude ball should all tilt the same way, and no corner of the view should be blank.
- **The cockpit at a phone shape**, `--width 200 --height 420`. Nothing on the dashboard should overlap or fall off the edge.

Take frames at more than one seed and with a turn held. One good frame proves little.

`snapshot` cannot show what needs input over time, such as a fight or a change of shape. For that, write a short script outside `src/`, run it from the kit's folder with `bun`, and look at the PNG:

```js
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const { createGame } = await import(resolve('examples/worldfight/src/game.js'))
const { encodePng } = await import(resolve('scripts/lib/png.mjs'))
const game = createGame({ seed: 7, view: 'chase', level: 2 }) // level is this game's own option
game.resize(384, 240)
for (let i = 0; i < 240; i++) {
  if (i === 200) game.roll() // input on the frame it is needed: press(), setKeys(), roll()
  game.update(1 / 60)
}
const frame = game.render()
writeFileSync('/tmp/fight.png', encodePng(frame.bytes, frame.width, frame.height, 2))
```

## 3. Play it in a browser

```sh
bun start                         # the starter
bun start --game examples/<name>  # another game
```

Open the address it prints. When input, the page or timing changed, try: steering with the pointer in every view, a click, a hold, the keys, Space to go round the views, resizing the window, and a narrow phone-shaped window. Confirm the browser's console has no errors.

Then play for a minute and ask a different question: is this good to play? No check answers that.

If you drive a browser from a tool, keep the tab visible. A hidden tab slows its animation to a crawl, and the game will seem stuck. If you cannot, start a headless Chrome of your own on its own debugging port, with `--disable-backgrounding-occluded-windows --disable-renderer-backgrounding --disable-background-timer-throttling`.

## 4. Measure speed when you touch drawing

`bun run check` prints milliseconds per frame for each view. Compare before and after your change. A frame has 16.6 milliseconds at 60 frames per second, and slow phones need a wide margin. If your change doubles the time, find out why before going on.

Common causes: allocating inside the loop, a per-pixel function call that could be a table, repainting something every frame that could be painted once, or a larger picture.

## 5. Add a check for a new promise

A feature of one game is protected by rules in that game's `states.js`. When you add a promise that every game must keep, add a check inside `runChecks()` in `scripts/check.mjs`:

```js
{
  const game = createGame({ seed: 7 })
  game.resize(384, 240)
  fly(game, 60)
  check('enemies: three are in the air after a second', game.enemies.length === 3, `${game.enemies.length} enemies`)
}
```

`fly(game, frames, each)` advances the game at 60 steps a second and returns the last frame. `check(name, ok, detail)` records the result. Write the name as a plain statement of what should be true.

Then break the feature on purpose, see the check fail, and put the feature back. A check that cannot fail protects nothing.

## 6. Redraw the figures when the starter's drawing changes

The pictures in `docs/` are drawn by the starter's own code. Run `bun run figures`, look at the files it writes in `docs/images/`, and commit them with your change.

## Before you report

- [ ] `bun run check` passes, and you ran it after your last edit.
- [ ] You looked at fresh snapshots.
- [ ] You played it in a browser if you can, and tried the inputs if input or the page changed.
- [ ] The README, the matching skill and the documents still describe what the code does.
- [ ] You say plainly what you checked and what you did not.
