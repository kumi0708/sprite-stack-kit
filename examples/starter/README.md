# The starter game

A small flight game that shows every technique in the kit. Change it in place, or copy this folder to `examples/<your-game>` and change the copy.

Run it from the repository root with `bun start`.

![The three views: from above, from behind, and from the cockpit](../../docs/images/views.png)

## The files, in the order to read them

| File | What it does | Change first |
| --- | --- | --- |
| `src/framebuffer.js` | The low-resolution picture: one number per pixel, a depth per pixel, colour helpers, the dither pattern | |
| `src/camera.js` | The one formula that turns a world point into a screen pixel, and the three camera poses | |
| `src/model.js` | The craft as a grid of slices, built from simple shapes | `sculpt()` for the shape, `CRAFT_PALETTE` for the colours |
| `src/stack.js` | Draws a stack at any heading, bank and pitch, with its outline and flames | |
| `src/world.js` | Islands and clouds from a seed, and the world's colours | `MATERIALS` for the colours, `buildWorld()` for the land |
| `src/terrain.js` | Draws the world as stacked columns from near to far, with shadows, fog and sky | |
| `src/roll.js` | Turns the finished picture of the world, so the cockpit view can bank | |
| `src/paint.js` | Dots, boxes, lines, discs and a 3 × 5 pixel font, for instruments | `SHAPES`, to add letters |
| `src/cockpit.js` | The cockpit: a canopy frame and a dashboard painted once, then instruments and a head-up display drawn every frame | The colours at the top, `plan()` for the layout |
| `src/game.js` | How the craft flies, where the camera sits, the order things are drawn in | `TUNING` at the top |
| `src/main.js` | The page: canvas size, input, the frame loop | The key bindings |
| `src/rng.js` | Seeded random numbers and noise that tiles | |

`index.html` is the page itself: one canvas, a VIEW button and a line of hints.

`states.js` is not part of the game. It is the game's state map: what the player can do, the states the game can be in, and the rules that must hold in all of them. `bun run states` walks every one.

## Four quick experiments

1. In `src/game.js`, change `chaseAngle` from `15` to `30`. The chase camera now looks down more steeply.
2. In `src/game.js`, change `cockpitLens` from `0.62` to `0.4`. The cockpit view becomes a wide-angle lens.
3. In `src/model.js`, change the three `TRIM` colours in `CRAFT_PALETTE` (the second row of numbers) to three blues. The wingtips change colour.
4. Open `http://localhost:5173/?seed=42`. A different world appears, and it is the same every time for that seed.

[The tutorial](../../docs/tutorial.md) goes further, one step at a time.

## What it promises

`bun run check` checks these, so you will know if a change breaks one:

- The same seed gives the same world, and the same seed and input give the same frame.
- All three views fill every pixel at landscape, portrait and wide sizes, and still draw in a frame that is tiny.
- Every frame of every view change is complete.
- In the cockpit, the eye stays inside the craft and the picture banks with it.
- Steering works from behind and from the cockpit.
- The craft cannot be flown into the ground.
- A frame takes far less than a sixtieth of a second.
- There are no libraries, no network requests, no WebGL and no `Math.random()`.

## Driving the game from your own code

`game.js` knows nothing about the page. That is why the checks, the snapshot tool and the figure maker can all run it with no browser, and you can too:

```js
import { createGame } from './src/game.js'

const game = createGame({
  seed: 7, // which world
  view: 'top', // 'top', 'chase' or 'cockpit'
  tuning: { speed: 100 }, // any of the numbers in TUNING
  world: { land: 0.4, clouds: 0.3 }, // how much land and cloud, 0 to 1
})
game.resize(384, 240) // the size of the picture, in game pixels
game.setKeys(1, 0, false) // hold a right turn
for (let i = 0; i < 120; i++) game.update(1 / 60) // fly for two seconds
const frame = game.render() // frame.color is one number per pixel; frame.bytes is the same memory as RGBA
```

| Call | What it does |
| --- | --- |
| `update(seconds)` | Moves the game forward. Call it once per frame with the time since the last one |
| `render()` | Draws a frame and returns the picture: `{ width, height, color, depth, bytes }` |
| `resize(width, height)` | Sets the size of the picture. The only call that allocates memory |
| `pointerMove(x, y)`, `pointerLeave()` | The pointer's position, in game pixels |
| `press()`, `release()` | The button. A short press is a roll, a long one opens the thrusters |
| `setKeys(turn, climb, boost)` | Keys or a stick: `turn` and `climb` from −1 to 1, `boost` true or false |
| `roll()` | A barrel roll |
| `nextView()`, `setView(name)` | Change view. The camera slides there |
| `toggleSpread()` | Pull the slices of the stack apart, or put them back |
| `toggleInvert()`, `inverted` | Swap up and down on the keys and the pointer, as with a plane's stick, and read whether they are swapped. `createGame({ invert: true })` starts swapped |
| `view`, `chaseAmount`, `cockpitAmount`, `viewRoll`, `time`, `boost` | Read-only: where the camera is, and how the flight is going |
| `world`, `model`, `craft`, `camera`, `frame` | The game's own objects, to read |
