// The starter's state map: the states the game can be in, the steps that move it between
// them, and the rules that must hold in every one. `bun run states` walks all of it.
//
// A new feature usually adds a line to each part: what the player can now do (events), what
// can now be true (state), and what must never happen (rules). Write every name the way a
// player would say it, because a broken rule is reported in these words.

import { EMPTY } from './src/framebuffer.js'
import { groundAt } from './src/world.js'

/**
 * Every walk starts from a fresh game like this. A small picture and 30 frames a second
 * keep the walk quick; the game moves the same at any frame rate. At 96 × 60 a diving craft
 * slipped off the bottom edge in the view from above, so the picture is a little bigger.
 */
export const start = { seed: 7, width: 120, height: 72, framesPerSecond: 30 }

/**
 * What the player can do. Each is followed by one frame of the game. `notes` starts empty on
 * every walk: write down here what the player's hands are doing, when the game cannot be
 * asked for it.
 */
export const events = {
  'you press VIEW': (game) => game.nextView(),
  'you click': (game, notes) => {
    game.press()
    game.release()
    notes.held = false
  },
  'you hold the button down': (game, notes) => {
    game.press()
    notes.held = true
  },
  'you let the button go': (game, notes) => {
    game.release()
    notes.held = false
  },
  'you turn right with the keys': (game, notes) => {
    game.setKeys(1, 0, false)
    notes.upKey = false
  },
  'you hold the up key': (game, notes) => {
    game.setKeys(0, 1, false)
    notes.upKey = true
    notes.from = game.craft.z
  },
  'you press I to swap up and down': (game, notes) => {
    game.toggleInvert()
    notes.from = game.craft.z // the dragon now heads the other way from here
  },
  'you press E': (game, notes) => {
    game.toggleSpread()
    notes.apart = !notes.apart
  },
}

/** Time going by, in frames: once short enough to catch things half-way, once long enough for everything to finish. */
export const waits = {
  'a moment passes': 7,
  'everything settles': 100,
}

/**
 * The state the game is in, in a few words. Two games that give the same answer count as
 * the same state, so anything that decides what happens next has to be in here.
 */
export function state(game, notes) {
  const arrived = game.chaseAmount === (game.view === 'chase' ? 1 : 0) && game.cockpitAmount === (game.view === 'cockpit' ? 1 : 0)
  const apart = game.spread > 2.5
  return {
    view: game.view,
    camera: arrived ? 'arrived' : 'moving',
    craft: game.craft.spin >= 0 ? 'rolling' : 'level',
    button: notes.held ? 'held' : 'up',
    thrusters: game.boost > 0.5 ? 'open' : 'closed',
    stack: apart === !!notes.apart ? (apart ? 'apart' : 'solid') : apart ? 'closing' : 'opening',
    controls: game.inverted ? 'up and down swapped' : 'normal',
    upKey: notes.upKey ? 'held' : 'up',
  }
}

/** For the chart: a coarser name, so the picture stays small enough to read. */
export function label(name) {
  const [view, camera] = name.split(' · ')
  return camera === 'moving' ? `moving to ${view}` : view
}

const count = (frame, colour) => {
  let n = 0
  for (let i = 0; i < frame.width * frame.height; i++) if (frame.color[i] === colour) n++
  return n
}

/**
 * What must hold. `check(game, frame, state, notes)` returns nothing when the rule holds, or
 * a few words saying how it is broken. A rule with `after` is only asked at the end of that wait.
 */
export const rules = [
  {
    name: 'every pixel of every frame is drawn',
    check: (game, frame) => {
      const empty = count(frame, EMPTY)
      return empty ? `${empty} pixels were left empty` : ''
    },
  },
  {
    name: 'the camera and the craft only ever hold real numbers',
    check: (game) => {
      const { camera: cam, craft } = game
      const values = [cam.x, cam.y, cam.alt, cam.persp, cam.tilt, cam.zoom, craft.x, craft.y, craft.z, craft.yaw, craft.roll, craft.pitch, game.viewRoll]
      return values.every(Number.isFinite) ? '' : `one of them is ${values.find((v) => !Number.isFinite(v))}`
    },
  },
  {
    name: 'the camera is never more than a whole camera: its shares of the chase and cockpit views add up to 1 at most',
    check: (game) => {
      const sum = game.chaseAmount + game.cockpitAmount
      return sum > 1 + 1e-9 ? `chase ${game.chaseAmount.toFixed(3)} + cockpit ${game.cockpitAmount.toFixed(3)} = ${sum.toFixed(3)}` : ''
    },
  },
  {
    name: 'the craft never touches the ground',
    check: (game) => {
      const clear = game.craft.z - groundAt(game.world, game.craft.x, game.craft.y)
      return clear > 2 ? '' : `it is ${clear.toFixed(1)} px above the ground`
    },
  },
  {
    name: 'the picture is only banked when the camera is in the cockpit, or on its way in or out',
    check: (game) => (game.cockpitAmount === 0 && game.viewRoll !== 0 ? `banked ${game.viewRoll.toFixed(2)} rad with no cockpit in the view` : ''),
  },
  {
    name: 'once the camera has arrived, the craft is in sight from above and from behind, and out of sight from the cockpit',
    check: (game, frame, s) => {
      if (s.camera !== 'arrived') return ''
      const outline = count(frame, game.model.outline)
      if (s.view === 'cockpit') return outline === 0 ? '' : `${outline} pixels of the craft's outline show in the cockpit`
      return outline > 8 ? '' : `only ${outline} pixels of the craft's outline show`
    },
  },
  {
    name: 'holding the up key climbs, or dives when up and down are swapped',
    after: 'everything settles',
    check: (game, frame, s, notes) => {
      if (!notes.upKey) return ''
      const z = game.craft.z
      const moved = z - notes.from
      const ground = groundAt(game.world, game.craft.x, game.craft.y)
      if (game.inverted) return moved < -3 || z - ground < 20 ? '' : `it went ${moved.toFixed(1)} px, from ${notes.from.toFixed(1)}, instead of down`
      return moved > 3 || z > 225 ? '' : `it went ${moved.toFixed(1)} px, from ${notes.from.toFixed(1)}, instead of up`
    },
  },
  {
    name: 'left alone, the camera arrives and a roll finishes',
    after: 'everything settles',
    check: (game, frame, s) => (s.camera === 'arrived' && s.craft === 'level' ? '' : `after more than three seconds the camera is still ${s.camera} and the craft is ${s.craft}`),
  },
]
