# Tutorial: make it yours in eight small steps

This is the hands-on path. Each step is a few lines in one file. It tells you what to change, what you should see, and what you just learned.

You do not need to have read anything else first. If a word is new, [the glossary](glossary.md) has it.

## Before you start

You need [Bun](https://bun.sh) and a text editor. From the repository's folder, run:

```sh
bun start
```

Open the address it prints. Keep that tab open. After each change, save the file and **reload the page** to see it.

Three things worth knowing:

- All the game's files are in `examples/starter/src`.
- You cannot break anything for good. `git restore examples/starter` puts every file back.
- `bun run check` tells you in a few seconds whether the game still keeps its promises. Run it whenever you like.

## Step 1. Change one number

Open `game.js`. Near the top is a list called `TUNING`. Find this line:

```js
  chaseAngle: 15, // degrees the chase eye looks down
```

Change `15` to `30`. Save, reload, and press **Space** to go to the chase view.

**You should see** the camera looking down on the craft more steeply, with the horizon higher up the screen.

**What you learned.** `TUNING` holds the numbers that set how the game feels: speed, turn rate, how far the camera sits behind the craft, how long a view change takes. Try a few. `speed: 140` is fun. Each one has a comment that says what it does.

Put `chaseAngle` back to `15` when you are done, or leave it if you like it.

## Step 2. Recolour the craft

Open `model.js` and find `CRAFT_PALETTE`:

```js
const CRAFT_PALETTE = [
  null,
  [112, 120, 136], [176, 182, 186], [228, 230, 222],
  [118, 28, 42], [178, 42, 46], [228, 66, 56],
```

Each row is one kind of surface, as three colours: dark, middle, light. Each colour is red, green, blue, from 0 to 255. The first row is the hull. The second row is the trim, which is red.

Replace the second row with three blues:

```js
  [24, 60, 130], [36, 96, 190], [70, 140, 240],
```

**You should see** blue wingtips, a blue trailing edge on the wing, and blue tops on the fins.

**What you learned.** A model does not store colours. It stores small numbers that point into this list. Change a row and every cell that points at it changes. The three tones are chosen for you: a cell that faces the light gets the light tone, and a cell that faces away gets the dark one.

## Step 3. Change the craft's shape

Stay in `model.js` and find the function `sculpt()`. It builds the craft from a few loops: a body, a wing, two fins, a canopy and two engines. Each loop calls `put(a, k, z, kind)` to fill one cell:

- `a` is how far the cell is from the centre line. `put` fills both sides, so the craft is always symmetrical.
- `k` runs from the nose (0) to the tail (41).
- `z` is the slice, from the belly (0) up.

Add winglets. Just above the last line of the function, `return grid`, add:

```js
  // winglets: a small fin standing on each wingtip
  for (let k = 31; k <= 34; k++) {
    for (let z = 4; z <= 6; z++) put(14, k, z, TRIM)
  }
```

**You should see** a small upright fin on each wingtip. Press **E** to pull the slices apart: your winglets are in three of them.

**What you learned.** A shape is just filled cells. Four cells long, three slices tall, one cell thick, 14 cells out from the centre: that is a winglet. Anything you can describe with loops like this, you can build. Try making the fins taller, or the nose longer.

## Step 4. Recolour the land

Open `world.js` and find `MATERIALS`. Each row is one kind of ground, as two colours: the top of the ground, and the side of it that shows on a slope.

The sixth, seventh and eighth rows are the three grasses:

```js
  [[104, 176, 62], [60, 120, 50]],
  [[78, 150, 54], [52, 106, 46]],
  [[142, 204, 86], [66, 130, 52]],
```

Replace them with three sands:

```js
  [[222, 176, 98], [170, 126, 72]],
  [[204, 156, 86], [152, 110, 64]],
  [[238, 196, 116], [182, 138, 80]],
```

**You should see** desert islands. The trees are still green, because trees are their own materials: the next two rows.

**What you learned.** The land is a map of heights and materials. The colours live in one small table, so a whole new look is a few rows. The side colour is what makes a slope read as a slope. Keep it darker than the top.

## Step 5. Put a tower on the map

Still in `world.js`, go to the very end of `buildWorld()`. Just above the last line, which starts with `return {`, add:

```js
  // a tower: a column of rock with a white top, a little north of where the flight starts
  for (let dy = -3; dy <= 3; dy++) {
    for (let dx = -3; dx <= 3; dx++) {
      const at = (((spawnY - 70 + dy) & WORLD_MASK) << WORLD_SHIFT) | ((spawnX + dx) & WORLD_MASK)
      heights[at] = 30
      materials[at] = Math.abs(dx) < 2 && Math.abs(dy) < 2 ? MAT.SNOW : MAT.ROCK
    }
  }
```

**You should see** a grey tower with a white top standing in the sea, close to where you start. It is there right after a reload. Fly at it: the craft climbs over it by itself. From the chase view you can pass behind it.

**What you learned.** This is the most important idea in the kit. You did not draw a tower. You wrote the number 30 into 49 cells of the height map, and the renderer did everything else: the walls, the top, the shadow it casts, and hiding the craft behind it. Buildings, walls, bridges of rock and pyramids are all made this way.

The `& WORLD_MASK` keeps a position on the map when it runs off an edge. Every read and write of the map needs it.

## Step 6. Change the cockpit

Open `cockpit.js`. Near the top, find:

```js
const HUD = rgb(255, 170, 44)
```

Change it to a green:

```js
const HUD = rgb(120, 255, 150)
```

Now add a read-out. Find the function `drawHud()`. Its last line draws the heading above the nose marker. Just below that line, before the closing `}`, add:

```js
  // thrusters, as a percentage, under the heading
  number(fb, cx - 5 * size, cy - Math.round(reach * 0.62) + 7 * size, g.boost * 100, 3, HUD, size)
```

Reload and press **Space** twice to reach the cockpit.

**You should see** green marks on the glass, and a second number under the heading that reads `000`. Hold the mouse button, or **Shift**, and it climbs to `100`.

**What you learned.** The cockpit has two kinds of part. The frame and the dashboard are painted once. Everything that moves is drawn every frame from `g`, the game's gauges: speed, height, heading, turn, climb, boost. An instrument is a few lines that read a number and draw. `number()`, `text()`, `box()` and `line()` come from `paint.js`.

## Step 7. Look at your work the way the tools do

Stop and check what you have made:

```sh
bun run check
```

Every line should start with `ok`. These checks fly your game with no browser. They confirm, among other things, that your craft is still symmetrical, that the same seed still gives the same world, and that every frame of every view change is complete.

Then save some frames:

```sh
bun run snapshot
```

Look in the `snapshots/` folder. There is a picture of each view, a picture half-way through each camera move, and one with the slices pulled apart. Useful options:

```sh
bun run snapshot --view cockpit --turn 1 --boost   # a hard right turn with the thrusters open
bun run snapshot --seed 42 --seconds 8             # another world, after eight seconds of flight
```

**What you learned.** The game is repeatable: the same seed and the same input always draw the same frames. So a picture can be made on demand, and a mistake can be seen again exactly. This is also how a coding agent checks its own work on your game.

## Step 8. Make a copy that is yours

So far you have changed the starter in place. For a game of your own, work in a copy:

```sh
cp -r examples/starter examples/my-game
bun start --game examples/my-game
bun run check --game examples/my-game
bun run snapshot --game examples/my-game
```

Then put the starter back as it was:

```sh
git restore examples/starter
```

**What you learned.** A game is one folder with no build step. The checks and the snapshot tool work on any copy that keeps the starter's file names.

## Where to go from here

Pick something you want to see, and read the guide that matches. The guides are in `.agents/skills`. They are written for coding agents, and they are just as useful to people.

| Idea | How hard | Read |
| --- | --- | --- |
| A different craft: a balloon, a dragon, a boat | Easy | [sprite-stack-models](../.agents/skills/sprite-stack-models/SKILL.md) |
| A different world: ice, desert, a city of blocks | Easy | [stacked-terrain](../.agents/skills/stacked-terrain/SKILL.md) |
| A new dial or screen in the cockpit, or a score | Easy | [cockpit-and-hud](../.agents/skills/cockpit-and-hud/SKILL.md) |
| Smoke, spray or sparks | Medium | [game-feel](../.agents/skills/game-feel/SKILL.md) |
| A second kind of object: boats on the sea, balloons in the air | Medium | [sprite-stack-models](../.agents/skills/sprite-stack-models/SKILL.md) |
| Gamepad support, or touch buttons | Medium | [game-feel](../.agents/skills/game-feel/SKILL.md) |
| A fourth view: a map from straight above, or a side view | Medium | [one-camera-views](../.agents/skills/one-camera-views/SKILL.md) |
| Sound with no sound files | Medium | [game-feel](../.agents/skills/game-feel/SKILL.md) |
| Enemies and something to shoot them with | Hard | [game-feel](../.agents/skills/game-feel/SKILL.md), then [study-the-reference](../.agents/skills/study-the-reference/SKILL.md) |

To understand why any of it works, read [A deeper look](deep-dive.md). It has more things to try, and they go further into the renderer than this page does.

If you build something, show people. And please credit Dash ([@creativedash](https://x.com/creativedash)), whose game this all comes from. If you would like your game or your prompt listed here, [CONTRIBUTING.md](../CONTRIBUTING.md) says how.
