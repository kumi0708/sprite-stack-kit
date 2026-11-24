// The game: how the ship flies, which level it is on, what shape it has, where the camera
// sits, and the order things are drawn in. It knows nothing about the page. main.js feeds it
// input and shows its picture, and scripts/snapshot.mjs runs it with no browser at all.

import { createFramebuffer, BAYER4, rgb, tint } from './framebuffer.js'
import { createCamera, project, aimCamera, eyeDistance } from './camera.js'
import { buildWorld, groundAt, LEVELS, WORLD_SIZE, WORLD_MASK, WORLD_SHIFT, WATER_BELOW, CLOUD_BASE, TOP_Z, SUN_X, SUN_Y } from './world.js'
import { acrossX, acrossY } from './atlas.js'
import { drawWorld, drawSky } from './terrain.js'
import { buildCraft, buildPlane, buildRival, flashOf } from './model.js'
import { drawStack, stackAxes } from './stack.js'
import { createSheet, sizeSheet, fitSheet, pasteRolled } from './roll.js'
import { createCockpit } from './cockpit.js'
import { drawHud, drawUnder } from './hud.js'
import { createDogfight, FIGHT } from './dogfight.js'
import { createEffects } from './effects.js'
import { hash2 } from './rng.js'

// a round in flight is a short line: hot at the front, cooler behind
const ROUND_OURS = [rgb(255, 196, 72), rgb(255, 252, 214)]
const ROUND_THEIRS = [rgb(255, 70, 96), rgb(255, 206, 214)]
const MISSILE_OURS = rgb(246, 248, 255)
const MISSILE_THEIRS = rgb(255, 120, 90)
const MISSILE_FLAME = rgb(255, 226, 120)
const STREAK = rgb(244, 250, 255)
const WHITE = rgb(255, 255, 255)

export const TUNING = {
  speed: 84, // world px per second, in the city
  levelSpeed: [0.55, 0.75, 1], // × speed on each level: the higher up, the more ground a pixel is
  boost: 1.7, // × speed while the thrusters are open
  turnRate: 1.4, // radians per second at full deflection
  planeTurn: 1.3, // × turnRate as a plane
  bank: 0.8, // radians of bank at full turn rate
  altitude: 58, // cruising height
  ceiling: 230,
  clearance: 9, // the closest the ship comes to the ground
  viewSeconds: 1.2, // a view change is nearly done after this long, then settles gently
  cameraFollow: 0.5, // overhead: how much of the ship's turn the camera makes with it
  chaseDistance: 130, // world px from the eye to the ship
  chaseAngle: 15, // degrees the chase eye looks down
  chaseWidth: 0.15, // how wide the rocket is in the chase view, as a share of the frame
  cockpitLook: 50, // world px from the cockpit eye to the point ahead that it looks at
  cockpitEye: 2.5, // how far above the ship's centre the cockpit eye sits
  cockpitLens: 0.62, // the cockpit lens, as a share of the frame's longer side; shorter sees wider
  cockpitPitch: 0.6, // how much of the ship's pitch the cockpit view shows; 1 is true to life
  cockpitRoll: 1, // … and how much of its bank
  holdSeconds: 0.22, // a shorter press is a click (a roll); a longer one is a hold
  rollSeconds: 0.75,
  rollRest: 0.3, // seconds after a roll before the next can start
  trailSeconds: 2,
  shiftSeconds: 1.7, // how long a change of level takes
  shiftZoom: 2.8, // how far the camera closes in on the way through
  morphSeconds: 1.1, // how long the ship takes to turn into a plane, or back
  slowRate: 0.16, // how fast time runs while it is slowed
  wreckSeconds: 1.4, // how long a plane that is shot down falls before it blows up
}

/** The views, in the order the VIEW button steps through them. */
export const VIEWS = ['top', 'chase', 'cockpit']

const TRAIL_POINTS = 120
const TRAIL_GAP = 3 // world px between trail points
// The ship dissolves as the eye comes up to it.
const FADE_NEAR = 30 // gone when the eye is this close, in world px …
const FADE_FAR = 70 // … and solid from here out
const FADE_SHARE = 0.54 // … or from this share of the chase distance
const EDGE = 24 // this close to the edge of a country or a city, the ship leaves it
const FENCE = 90 // in a fight, this much further in, the plane is turned back
const ARRIVE = 150 // coming down, the ship arrives at least this far inside the new map
const SKIM = 30 // below this height over water, the ship throws up spray
const MOTES = 56 // world px between the specks of air that streak past with the thrusters open

// "Move this share of the way to the goal." Smooths anything, at any frame rate.
const ease = (dt, rate) => 1 - Math.exp(-dt * rate)
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v)
const wrap = (angle) => angle - Math.PI * 2 * Math.round(angle / (Math.PI * 2))
const inOut = (t) => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))

// A spring from where a number is to where it is going, so a change starts gently, ends
// gently, and can be turned round half-way.
function glide(part, goal, pull, dt) {
  part.speed += (pull * pull * (goal - part.at) - 2 * pull * part.speed) * dt
  part.at = clamp(part.at + part.speed * dt, 0, 1)
  if (Math.abs(part.at - goal) < 0.0005 && Math.abs(part.speed) < 0.005) {
    part.at = goal
    part.speed = 0
  }
}

export function createGame(options = {}) {
  // Tools that start many games on one seed pass the first game's world to the rest.
  const levels = options.world?.levels ?? buildWorld(options.seed ?? 7).levels
  let level = clamp(options.level | 0, 0, levels.length - 1)
  let world = levels[level]
  const rocket = buildCraft()
  const plane = buildPlane()
  const rival = buildRival()
  const rivalHit = flashOf(rival)
  const planeHit = flashOf(plane, [255, 214, 206])
  let model = LEVELS[level].city ? plane : rocket // the shape the ship has, or is nearer to
  const tune = { ...TUNING, ...options.tuning, craftWidth: rocket.width }
  const fadeFar = Math.min(FADE_FAR, tune.chaseDistance * FADE_SHARE)
  const fadeNear = fadeFar * (FADE_NEAR / FADE_FAR)

  // What happened, counted, for the page to play as sound. The game never plays anything.
  const heard = {
    shot: 0, foeShot: 0, hit: 0, hurt: 0, blast: 0, splash: 0, launch: 0, inbound: 0, lock: 0, evade: 0,
    down: 0, wave: 0, clear: 0, win: 0, lose: 0, morph: 0, roll: 0, empty: 0, reload: 0, restart: 0,
  }
  // How the game shakes, flashes and slows, and what it says in the middle of the picture.
  // The dogfight and the effects ask for these by writing here.
  const feel = {
    shake: 0, // 0..1, dying away
    flash: 0,
    slow: 0, // seconds of slow motion left
    x: 0, y: 0, // where the player is: a blast far away is felt less
    noteId: 0, noteN: 0, noteAge: 99,
    note(id, n) {
      feel.noteId = id
      feel.noteN = n
      feel.noteAge = 0
    },
  }
  const fx = createEffects(heard, feel)
  const fight = createDogfight(tune, fx, heard, feel)
  fight.assist = options.assist === true
  const foe = { x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0, scale: 1, spread: 1, thrust: 0.6, solid: 1 }
  const fb = createFramebuffer()
  const sheet = createSheet() // a bigger picture: the world is drawn on it when the view is banked
  const cockpit = createCockpit()
  const cam = createCamera()
  const axes = {}

  // The marked place on each level where the ship can go down: the middle of the next map.
  const doors = []
  for (let n = 0; n + 1 < levels.length; n++) {
    const here = levels[n].map
    const below = levels[n + 1].map
    doors.push({
      x: acrossX(below, here, WORLD_SIZE / 2),
      y: acrossY(below, here, WORLD_SIZE / 2),
      // near enough to go down: over the place itself, with some room round a small one
      reach: Math.max(60, ((below.span / here.span) * WORLD_SIZE) / 2 + 30),
      label: LEVELS[n + 1].label,
    })
  }

  const craft = {
    x: world.spawnX,
    y: world.spawnY,
    z: tune.altitude,
    yaw: 0.9, // never wrapped, so anything that follows it turns the short way
    yawRate: 0,
    roll: 0, // the bank it holds in a turn
    pitch: 0,
    spin: -1, // a barrel roll in progress, 0..1, or −1
    spinDir: 1,
    vx: 0, vy: 0, vz: 0, // its speed east, south and up, for whatever aims at it
  }
  const input = { x: 0, y: 0, pointing: false, idle: 99, held: false, heldFor: 0, turn: 0, climb: 0, boost: false, byKeys: false, trigger: false }
  const focus = { x: craft.x, y: craft.y, alt: craft.z } // what the overhead and chase views look at
  const look = { x: craft.x, y: craft.y, alt: craft.z } // what the camera looks at: the three views mixed
  const pose = { x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0, scale: 1, spread: 1, thrust: 0, solid: 1 }
  const caster = {
    x: 0, y: 0, z: 0, cos: 1, sin: 0, across: 1, along: 1,
    footprint: model.footprint, width: model.width, length: model.length, pivotK: model.pivotK,
  }
  const hud = {
    level: 0, name: '', door: null, doorX: 0, doorY: 0, over: false, time: 0, fight, city: false,
    roll: 0, seat: 0, slow: 0, sightOn: false, sightX: 0, sightY: 0, sightZ: 0, threatAngle: 0,
    noteId: 0, noteN: 0, noteAge: 99, canRestart: false,
  }
  // what the cockpit's instruments show
  const gauges = {
    speed: 0, altitude: 0, heading: 0, turn: 0, climb: 0, boost: 0, roll: 0, pitch: 0, horizon: 0,
    low: false, rolling: false, idle: false, time: 0,
    city: false, wraps: false, threat: false, hull: 0, hullMax: 1, score: 0, rails: 0, railsMax: 0,
    blips: new Float32Array(16 * 3), blipCount: 0, // x, y and a kind: 1 an enemy, 2 one that is attacking, 3 a missile, 4 the place to go down at
  }
  const trails = [new Float32Array(TRAIL_POINTS * 4), new Float32Array(TRAIL_POINTS * 4)]
  const tip = { x: 0, y: 0, z: 0 }
  let trailHead = 0
  let trailCount = 0
  let trailX = craft.x
  let trailY = craft.y

  let time = 0
  let boost = 0 // 0..1: how far the thrusters are open
  let speed = tune.speed
  let altGoal = tune.altitude
  let floor = 0 // the lowest the ship may fly right now
  let climbRate = 0
  // Inverted controls, as in a plane: pushing up (W, the up arrow, or pointing above the
  // ship) dives, and pulling down climbs.
  let inverted = !!options.invert
  let handsOn = false // somebody is steering
  // The view is two numbers: how much of the chase pose and how much of the cockpit pose the
  // camera has. Both at 0 is the overhead view, and anything else is the camera on its way.
  let goal = Math.max(0, VIEWS.indexOf(options.view))
  const inChase = { at: goal === 1 ? 1 : 0, speed: 0 }
  const inCockpit = { at: goal === 2 ? 1 : 0, speed: 0 }
  let overheadHeading = craft.yaw * tune.cameraFollow
  let chaseHeading = craft.yaw
  let headingGap = wrap(chaseHeading - overheadHeading)
  let heading = overheadHeading
  let eyeLift = 0 // how far the eye is raised or lowered to stay clear of hills and clouds
  let tilt = 1
  let viewRoll = 0 // how far the picture is banked: the ship's roll, in the cockpit only
  // A change of level: which way (1 is down, −1 is up), how far through it is, and whether
  // the map has been swapped yet. The swap happens half-way, while the picture is covered.
  let shiftWay = 0
  let shiftAt = 0
  let swapped = false
  let cover = 0 // 0..1: how much of the picture the haze between levels hides
  // 0 is the rocket and 1 is the plane. It changes once the haze has cleared, so it is seen.
  let form = LEVELS[level].city ? 1 : 0
  let slow = 0 // 0..1: how far time is slowed
  let rollRest = 0
  let wreck = -1 // seconds since the plane was shot down, or −1
  let gone = false // … and it has blown up
  let wakeDue = 0
  let smokeDue = 0

  const inCity = () => LEVELS[level].city === true
  /** true while the plane can fight: it is a plane, over the city, in a fight that is not over */
  const armed = () => inCity() && shiftWay === 0 && form === 1 && fight.outcome === 'playing' && wreck < 0
  const canRestart = () => inCity() && shiftWay === 0 && fight.outcome !== 'playing' && fight.overFor > (fight.outcome === 'lost' ? 2.4 : 1.6)
  const spinAngle = () => (craft.spin < 0 ? 0 : craft.spinDir * Math.PI * 2 * inOut(craft.spin)) + (wreck >= 0 ? wreck * 5 : 0)

  /** How far the ship is from this level's marked place, the short way round on the Earth. */
  function doorGap(axis) {
    const door = doors[level]
    let gap = axis === 0 ? door.x - craft.x : door.y - craft.y
    if (level === 0 && axis === 0) gap -= WORLD_SIZE * Math.round(gap / WORLD_SIZE)
    return gap
  }
  const overDoor = () => level < doors.length && Math.max(Math.abs(doorGap(0)), Math.abs(doorGap(1))) < doors[level].reach

  /** The tallest ground the ship will pass over in the next moment, across its width. */
  function groundAhead() {
    const fx = Math.sin(craft.yaw)
    const fy = -Math.cos(craft.yaw)
    let top = 0
    for (let along = 0; along <= speed * 0.7; along += 12) {
      for (let across = -8; across <= 8; across += 8) {
        const h = groundAt(world, craft.x + fx * along - fy * across, craft.y + fy * along + fx * across)
        if (h > top) top = h
      }
    }
    return top
  }

  function wingtip(side) {
    const at = model.wingtips[side]
    const s = pose.scale
    tip.x = craft.x + (at.a * axes.rx + at.b * axes.fx + at.z * axes.ux) * s
    tip.y = craft.y + (at.a * axes.ry + at.b * axes.fy + at.z * axes.uy) * s
    tip.z = craft.z + (at.a * axes.rz + at.b * axes.fz + at.z * axes.uz) * s
  }

  /** Moves the ship to the same spot on the Earth, on another level's map. */
  function swap(to) {
    const from = world
    const down = to > level
    if (inCity()) fight.end()
    level = to
    world = levels[to]
    let x = acrossX(from.map, world.map, craft.x)
    let y = acrossY(from.map, world.map, craft.y)
    if (level === 0) x = ((x % WORLD_SIZE) + WORLD_SIZE) % WORLD_SIZE
    else {
      const room = down ? ARRIVE : EDGE * 2
      x = clamp(x, room, WORLD_SIZE - room)
      y = clamp(y, room, WORLD_SIZE - room)
    }
    focus.x += x - craft.x
    focus.y += y - craft.y
    craft.x = x
    craft.y = y
    if (down) craft.z = Math.max(craft.z, tune.ceiling * 0.6) // arrive high, and sink to cruising height
    altGoal = tune.altitude
    focus.alt = craft.z
    floor = 0
    trailCount = 0
    trailX = x
    trailY = y
    wreck = -1
    gone = false
    fx.clear()
    if (inCity()) fight.begin(craft, world)
  }

  /**
   * Works out what the camera looks at, which way, and how steeply, from how much of each
   * view it has. `vx` and `vy` are the ship's speed over the ground.
   */
  function frameCamera(dt, vx, vy) {
    const chase = inChase.at
    const seat = inCockpit.at
    const top = Math.max(0, 1 - chase - seat) // how much of the overhead pose is left
    const behind = 1 - top

    // The overhead and chase views look at a point that trails the ship, and that sits a
    // little ahead of it when seen from above …
    // … but never so far ahead that a small picture loses the ship off its edge
    const lead = Math.min(20 + 14 * boost, Math.min(fb.width, fb.height) * 0.2) * top
    const goalX = craft.x + Math.sin(craft.yaw) * lead
    const goalY = craft.y - Math.cos(craft.yaw) * lead
    const catchUp = ease(dt, 3.5)
    focus.x += vx * dt + (goalX - (focus.x + vx * dt)) * catchUp
    focus.y += vy * dt + (goalY - (focus.y + vy * dt)) * catchUp
    focus.alt += (craft.z - focus.alt) * ease(dt, 3)
    overheadHeading += (craft.yaw * tune.cameraFollow - overheadHeading) * ease(dt, 1.6)
    chaseHeading += (craft.yaw - chaseHeading) * ease(dt, 3.2)
    // The two headings drift apart by whole turns over time. Only the short way between them
    // matters, and it must not jump while the camera is between views.
    const gap = chaseHeading - overheadHeading
    if (behind === 0) headingGap = wrap(gap)
    else headingGap += wrap(gap - headingGap)

    // The cockpit view does not trail anything: its eye is fixed in the ship. It looks at a
    // point straight ahead along the nose, so that is where the camera's focus goes.
    const reach = tune.cockpitLook
    const nose = Math.tan(craft.pitch * tune.cockpitPitch) // the rise of the line of sight
    look.x = focus.x + (craft.x + Math.sin(craft.yaw) * reach - focus.x) * seat
    look.y = focus.y + (craft.y - Math.cos(craft.yaw) * reach - focus.y) * seat
    look.alt = focus.alt + (craft.z + tune.cockpitEye + nose * reach - focus.alt) * seat
    heading = overheadHeading + headingGap * behind + (craft.yaw - chaseHeading) * seat

    // How steeply the eye looks down: 45° overhead, the chase angle from behind, and along
    // the nose in the cockpit.
    const lean = Math.tan(((45 * top + tune.chaseAngle * chase) * Math.PI) / 180) - nose * seat
    const persp = chase / tune.chaseDistance + seat / reach
    let lift = 0
    if (behind > 0.3) {
      // Keep the eye above the ground it is over and out of the cloud layer.
      const back = 1 / persp
      const ground = groundAt(world, look.x - Math.sin(heading) * back, look.y + Math.cos(heading) * back) + 6
      const plain = look.alt + lean * back
      let eye = Math.max(plain, ground)
      if (eye > CLOUD_BASE - 3 && eye < TOP_Z + 3) eye = craft.z < CLOUD_BASE - 6 ? Math.max(ground, CLOUD_BASE - 3) : TOP_Z + 3
      lift = eye - plain
    }
    eyeLift += (lift - eyeLift) * ease(dt, 6)
    // In the cockpit the eye is the ship, which keeps itself clear, so the lift fades out.
    tilt = lean + eyeLift * (1 - seat) * persp
    viewRoll = (craft.roll * tune.cockpitRoll + spinAngle()) * seat * seat * (3 - 2 * seat)
  }

  function settle() {
    pose.x = craft.x
    pose.y = craft.y
    pose.z = craft.z
    pose.yaw = craft.yaw
    pose.roll = craft.roll + spinAngle()
    pose.pitch = craft.pitch
    pose.thrust = wreck >= 0 ? 0 : 0.35 + 0.65 * boost
    stackAxes(pose.yaw, pose.roll, pose.pitch, axes)
    aimCamera(cam, inChase.at, inCockpit.at, look, heading, tilt, fb.width, fb.height, tune)
    // With the thrusters open the lens widens a little, so the ground rushes by.
    cam.zoom *= 1 - 0.08 * boost * (inChase.at + inCockpit.at)
    // A change of level closes in on the place below, swaps the map, and draws back.
    if (shiftWay !== 0) {
      const u = shiftAt < 0.5 ? shiftAt * 2 : (1 - shiftAt) * 2 // 0 → 1 → 0
      const closing = shiftAt < 0.5 && shiftWay < 0 ? 0 : u * u // going up, the old map does not zoom
      cam.zoom *= 1 + (tune.shiftZoom - 1) * closing
      cover = clamp((u - 0.3) / 0.6, 0, 1)
    } else cover = 0
    if (feel.shake > 0) {
      // a hit or a blast: the whole picture jumps about, less and less
      const reach = feel.shake * Math.max(2, Math.min(fb.width, fb.height) * 0.035)
      const beat = (time * 60) | 0
      cam.cx += Math.round((hash2(beat, 3) / 127.5 - 1) * reach)
      cam.cy += Math.round((hash2(beat, 11) / 127.5 - 1) * reach)
    }
    // The ship dissolves as the eye comes up to it, and is gone before the eye is inside it.
    const away = project(cam, craft.x, craft.y, craft.z) ? eyeDistance(cam) : 0
    pose.solid = gone ? 0 : clamp((away - fadeNear) / (fadeFar - fadeNear), 0, 1)
  }

  /** Starts a new fight over the city, once the last one is over. Says whether it did. */
  function restart() {
    if (!canRestart()) return false
    wreck = -1
    gone = false
    altGoal = tune.altitude // the new plane climbs away from where the old one came down
    trailCount = 0
    fight.begin(craft, world)
    heard.restart++
    return true
  }

  function roll() {
    if (craft.spin >= 0 || rollRest > 0 || wreck >= 0) return
    craft.spin = 0
    craft.spinDir = craft.yawRate >= 0 ? 1 : -1
    heard.roll++
  }

  function update(seconds) {
    // The clock, and the time things happen in: the same, but for the moment after a missile
    // is thrown off or a fight ends, when everything but the player's own timers slows down.
    const real = clamp(seconds, 0, 0.05)
    if (real <= 0) return
    if (feel.slow > 0) feel.slow -= real
    const slowGoal = feel.slow > 0.25 ? 1 : 0 // it eases back to speed over the last quarter second
    slow += (slowGoal - slow) * ease(real, slowGoal ? 30 : 7)
    if (slow < 0.004 && slowGoal === 0) slow = 0
    const dt = real * (1 - (1 - tune.slowRate) * slow)
    time += dt
    input.idle += real
    if (input.held) input.heldFor += real
    feel.noteAge += real
    feel.shake = feel.shake < 0.03 ? 0 : feel.shake * Math.exp(-real * 6)
    feel.flash = feel.flash < 0.03 ? 0 : feel.flash * Math.exp(-real * 8)
    if (rollRest > 0) rollRest -= real

    // ── a change of level in progress
    if (shiftWay !== 0) {
      // a ship that is between shapes finishes changing first, so the change is never hidden
      if (swapped || form === 0 || form === 1) shiftAt += dt / tune.shiftSeconds
      if (!swapped && shiftAt >= 0.5) {
        swap(level + shiftWay)
        swapped = true
      }
      if (shiftAt >= 1) shiftWay = 0
    }
    const city = inCity()
    // In the middle of a fight the edge of the city turns the plane back: a fight is left with UP, not by accident.
    const fenced = city && shiftWay === 0 && fight.outcome === 'playing'
    const edge = Math.min(craft.x, craft.y, WORLD_SIZE - craft.x, WORLD_SIZE - craft.y)
    if (shiftWay === 0 && level > 0 && !fenced && edge < EDGE) ascend() // flown out of the side of a country or a city

    // the ship is a plane over the city and a rocket everywhere else
    const formGoal = city ? 1 : 0
    if (form !== formGoal && cover < 0.35) {
      if (form === 0 || form === 1) {
        heard.morph++
        feel.note(formGoal ? 1 : 2, 0)
      }
      const before = form
      form = clamp(form + ((formGoal > form ? 1 : -1) * dt) / tune.morphSeconds, 0, 1)
      if (before < 0.5 !== form < 0.5) {
        // half-way: the new shape takes over, in a burst of sparks
        model = form >= 0.5 ? plane : rocket
        trailCount = 0 // the wingtips have moved
        for (let n = 0; n < 3; n++) fx.sparks(craft.x, craft.y, craft.z)
        feel.flash = Math.max(feel.flash, 0.3)
      }
    }
    const turnRate = tune.turnRate * (1 + (tune.planeTurn - 1) * form)

    // Thrusters. Over the city a hold is the trigger, so the thrusters are Shift or the BOOST button.
    const holding = input.held && input.heldFor >= tune.holdSeconds
    const pushing = wreck < 0 && (input.boost || (holding && !city))
    boost += ((pushing ? 1 : 0) - boost) * ease(dt, pushing ? 5 : 2.5)
    // the ship slows to a crawl while the level changes, so it arrives where it left
    speed = tune.speed * tune.levelSpeed[level] * (1 + (tune.boost - 1) * boost) * (shiftWay !== 0 ? 0.2 : 1)
    if (wreck >= 0) speed = gone ? 0 : speed * 0.8
    const climbMax = tune.speed * 0.5

    // ── what the player is asking for
    const behind = inChase.at + inCockpit.at > 0.5 // steering from behind the ship, or from inside it
    const pointing = input.pointing && input.idle < 6 && !input.byKeys
    // Where the ship is on screen. In the cockpit the eye is inside it, so the middle of the
    // view stands in.
    let craftX = cam.cx
    let craftY = cam.cy
    if (inCockpit.at < 0.5 && project(cam, craft.x, craft.y, craft.z)) {
      craftX = cam.sx
      craftY = cam.sy
    }
    let want = 0
    handsOn = true
    if (wreck >= 0) {
      // shot down: nobody is flying it. It winds down in a spiral.
      want = turnRate * 0.6 * craft.spinDir
      altGoal = floor
    } else if (input.turn !== 0) {
      want = input.turn * turnRate
    } else if (pointing && behind) {
      // from behind: point left or right of the ship to turn
      const t = clamp((input.x - cam.cx) / (fb.width * 0.28), -1, 1)
      if (Math.abs(t) > 0.06) want = t * turnRate
    } else if (pointing) {
      // from above: the ship turns to face the pointer
      const px = input.x - craftX
      const py = input.y - craftY
      if (px * px + py * py > 14 * 14) {
        const wx = px * cam.cos - py * cam.sin // the same direction on the map
        const wy = px * cam.sin + py * cam.cos
        want = clamp(wrap(Math.atan2(wx, -wy) - craft.yaw) * 2.5, -turnRate, turnRate)
      }
    } else if (!input.byKeys) {
      // nobody at the controls: wander, so the scene is never still
      want = turnRate * (0.55 * Math.sin(time * 0.37) + 0.35 * Math.sin(time * 0.83 + 2))
      handsOn = false
    }
    if (fenced && wreck < 0 && edge < EDGE + FENCE) {
      want = clamp(wrap(Math.atan2(WORLD_SIZE / 2 - craft.x, -(WORLD_SIZE / 2 - craft.y)) - craft.yaw) * 3, -turnRate, turnRate)
      if (feel.noteAge > 1) feel.note(7, 0)
    }
    const upward = inverted ? -1 : 1
    if (wreck >= 0) {
      // falling
    } else if (input.climb !== 0) {
      altGoal += input.climb * upward * climbMax * dt
    } else if (pointing && behind) {
      // from behind: point above the ship to climb, below it to dive
      const raw = upward * clamp((craftY - input.y) / (fb.height * 0.4), -1, 1)
      const up = (Math.sign(raw) * Math.max(0, Math.abs(raw) - 0.08)) / 0.92
      altGoal = up >= 0 ? tune.altitude + up * (tune.ceiling - tune.altitude) : tune.altitude + up * (tune.altitude - floor)
    } else if (!handsOn) {
      altGoal += (tune.altitude - altGoal) * ease(dt, 0.8)
    }

    // ── flight
    craft.yawRate += (want - craft.yawRate) * ease(dt, 2.8)
    craft.yaw += craft.yawRate * dt
    const bank = clamp(craft.yawRate / turnRate, -1, 1) * tune.bank
    craft.roll += (bank - craft.roll) * ease(dt, 5)
    const vx = Math.sin(craft.yaw) * speed
    const vy = -Math.cos(craft.yaw) * speed
    craft.x += vx * dt
    craft.y += vy * dt
    if (level > 0) {
      // A country and a city have edges. In a fight the plane is held inside them; otherwise it
      // leaves through them, and must not run off the map while the way up is still starting.
      const room = fenced ? EDGE + 1 : 1
      craft.x = clamp(craft.x, room, WORLD_SIZE - room)
      craft.y = clamp(craft.y, room, WORLD_SIZE - room)
    }
    if (level === 0) {
      // the Earth goes round: keep the ship's position on the map, and move the camera with it
      const lap = craft.x < 0 ? WORLD_SIZE : craft.x >= WORLD_SIZE ? -WORLD_SIZE : 0
      const turn = craft.y < 0 ? WORLD_SIZE : craft.y >= WORLD_SIZE ? -WORLD_SIZE : 0
      if (lap || turn) {
        craft.x += lap
        craft.y += turn
        focus.x += lap
        focus.y += turn
        trailCount = 0
        fx.clear()
      }
    }
    if (craft.spin >= 0) {
      craft.spin += dt / tune.rollSeconds
      if (craft.spin >= 1) {
        craft.spin = -1
        rollRest = tune.rollRest
      }
    }
    // It follows the ground ahead with room to spare, so it can skim a hill but never hit one.
    const floorNow = groundAhead() + tune.clearance
    floor += (floorNow - floor) * ease(dt, floorNow > floor ? 9 : 3)
    altGoal = clamp(altGoal, floor, Math.max(floor, tune.ceiling))
    const before = craft.z
    craft.z += clamp((altGoal - craft.z) * ease(dt, 3), -climbMax * dt, climbMax * dt)
    const hard = groundAt(world, craft.x, craft.y) + tune.clearance * 0.6
    if (craft.z < hard) craft.z += (hard - craft.z) * ease(dt, 20)
    climbRate += ((craft.z - before) / dt - climbRate) * ease(dt, 6)
    craft.pitch += (clamp(climbRate / Math.max(20, tune.speed), -0.5, 0.5) - craft.pitch) * ease(dt, 4)
    craft.vx = vx
    craft.vy = vy
    craft.vz = climbRate

    // ── the fight
    feel.x = craft.x
    feel.y = craft.y
    if (city && shiftWay === 0) {
      // the guns are silent in a roll: a roll is for getting out of the way
      const firing = armed() && craft.spin < 0 && (input.trigger || holding)
      const was = fight.outcome
      fight.update(dt, real, world, craft, firing)
      if (fight.outcome !== was) {
        if (fight.outcome === 'lost') wreck = 0
        else roll() // a victory roll
      }
    }
    if (wreck >= 0) {
      wreck += dt
      if (!gone && wreck > tune.wreckSeconds) {
        gone = true
        trailCount = 0
        fx.blast(craft.x, craft.y, craft.z, 1.8, false)
        fx.debris(craft.x, craft.y, craft.z, vx * 0.4, vy * 0.4, 10, 50)
      }
    }
    // smoke: pouring from a plane that is shot down, trailing from one that is badly hit
    if (!gone && city && form === 1 && (wreck >= 0 || fight.hull <= 3)) {
      smokeDue -= dt
      if (smokeDue <= 0) {
        smokeDue = wreck >= 0 ? 0.03 : 0.08
        fx.smoke(craft.x - Math.sin(craft.yaw) * 8, craft.y + Math.cos(craft.yaw) * 8, craft.z, 0, 0, 6, wreck >= 0 ? 2.4 : 1.6, 1, wreck >= 0 || fight.hull <= 1 ? 2 : 0)
        if (wreck >= 0) fx.smoke(craft.x, craft.y, craft.z, vx * 0.3, vy * 0.3, 2, 1.4, 0.3, 3)
      }
    }
    // low over water, the ship throws up two lines of spray
    if (!gone && craft.z < SKIM && world.materials[(((craft.y | 0) & WORLD_MASK) << WORLD_SHIFT) | ((craft.x | 0) & WORLD_MASK)] < WATER_BELOW) {
      wakeDue -= dt
      if (wakeDue <= 0) {
        wakeDue = 0.035
        const east = Math.sin(craft.yaw)
        const south = -Math.cos(craft.yaw)
        const low = 1 - (craft.z - tune.clearance) / (SKIM - tune.clearance)
        for (let side = -1; side <= 1; side += 2) {
          const out = side * (10 + 12 * boost)
          fx.smoke(craft.x - east * 5 - south * side * 3, craft.y - south * 5 + east * side * 3, 1.5, -south * out, east * out, 7 + 6 * low, 1.2 + low * 1.2 + boost * 0.6, 0.5 + 0.4 * low, 1)
        }
      }
    }
    fx.update(dt, world)

    // ── the view: each pose's share glides to 1 or to 0, and the camera follows
    glide(inChase, goal === 1 ? 1 : 0, 4.6 / tune.viewSeconds, real)
    glide(inCockpit, goal === 2 ? 1 : 0, 4.6 / tune.viewSeconds, real)
    frameCamera(dt, vx, vy)
    settle()

    // trails: drop a point every few pixels flown
    const moved = (craft.x - trailX) ** 2 + (craft.y - trailY) ** 2
    if (moved > TRAIL_GAP * TRAIL_GAP && !gone) {
      trailX = craft.x
      trailY = craft.y
      for (let side = 0; side < model.wingtips.length && side < 2; side++) {
        wingtip(side)
        const o = trailHead * 4
        trails[side][o] = tip.x
        trails[side][o + 1] = tip.y
        trails[side][o + 2] = tip.z
        trails[side][o + 3] = time
      }
      trailHead = (trailHead + 1) % TRAIL_POINTS
      if (trailCount < TRAIL_POINTS) trailCount++
    }
  }

  function drawTrails(to) {
    const W = to.width
    const H = to.height
    const color = to.color
    const zbuf = to.depth
    const tones = world.palette.trail
    for (let side = 0; side < model.wingtips.length && side < 2; side++) {
      const points = trails[side]
      wingtip(side)
      let joined = project(cam, tip.x, tip.y, tip.z) && eyeDistance(cam) >= fadeNear
      let fromX = cam.sx
      let fromY = cam.sy
      for (let n = 0; n < trailCount; n++) {
        const o = ((trailHead - 1 - n + TRAIL_POINTS) % TRAIL_POINTS) * 4
        const age = (time - points[o + 3]) / tune.trailSeconds
        if (age >= 1) break
        // a point behind the eye, or so close in front of it that it would be drawn huge
        if (!project(cam, points[o], points[o + 1], points[o + 2]) || eyeDistance(cam) < fadeNear) {
          joined = false
          continue
        }
        const toX = cam.sx
        const toY = cam.sy
        const steps = Math.ceil(Math.max(Math.abs(toX - fromX), Math.abs(toY - fromY)))
        if (joined && steps < 400) {
          const tone = tones[age < 0.3 ? 0 : age < 0.65 ? 1 : 2]
          const strength = (1 - age) * 16 // older trail is drawn with fewer pixels: it thins, it does not blend
          const thick = cam.scale > 2.2 ? 2 : 1
          const near = cam.depth - 1
          for (let i = 0; i <= steps; i++) {
            const x0 = Math.round(fromX + ((toX - fromX) * i) / (steps || 1))
            const y0 = Math.round(fromY + ((toY - fromY) * i) / (steps || 1))
            for (let y = y0; y < y0 + thick; y++) {
              for (let x = x0; x < x0 + thick; x++) {
                if (x < 0 || y < 0 || x >= W || y >= H) continue
                const at = y * W + x
                if (zbuf[at] < near) continue // behind a hill or a cloud
                if (strength > BAYER4[((y & 3) << 2) | (x & 3)]) color[at] = tone
              }
            }
          }
        }
        fromX = toX
        fromY = toY
        joined = true
      }
    }
  }

  /** A line between two points on the picture, hidden where the world is nearer than `near`. */
  function stroke(to, x0, y0, x1, y1, near, tail, head, thick) {
    const W = to.width
    const H = to.height
    const steps = Math.min(60, Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)))))
    for (let i = 0; i <= steps; i++) {
      const px = Math.round(x0 + ((x1 - x0) * i) / steps)
      const py = Math.round(y0 + ((y1 - y0) * i) / steps)
      for (let y = py; y < py + thick; y++) {
        for (let x = px; x < px + thick; x++) {
          if (x < 0 || y < 0 || x >= W || y >= H) continue
          const at = y * W + x
          if (to.depth[at] >= near) to.color[at] = i * 2 > steps ? head : tail
        }
      }
    }
  }

  /** With the thrusters open, specks of air streak past: fixed in the world, so they slide by. */
  function drawStreaks(to) {
    if (boost < 0.2 || gone) return
    const east = Math.sin(craft.yaw)
    const south = -Math.cos(craft.yaw)
    const long = 5 + 16 * boost
    const ink = boost * 11
    const cellX = Math.floor(craft.x / MOTES)
    const cellY = Math.floor(craft.y / MOTES)
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        for (let m = 0; m < 2; m++) {
          const x = (cellX + i + hash2(cellX + i + m * 31, cellY + j) / 255) * MOTES
          const y = (cellY + j + hash2(cellX + i, cellY + j + m * 17 + 5) / 255) * MOTES
          const z = craft.z + (hash2(cellX + i + m * 7, cellY + j + 9) / 255 - 0.5) * 44
          if (!project(cam, x, y, z) || eyeDistance(cam) < 10) continue
          const x0 = cam.sx
          const y0 = cam.sy
          const near = cam.depth - 1
          if (!project(cam, x - east * long, y - south * long, z)) continue
          if (ink > BAYER4[(((y0 | 0) & 3) << 2) | ((x0 | 0) & 3)]) stroke(to, cam.sx, cam.sy, x0, y0, near, STREAK, STREAK, 1)
        }
      }
    }
  }

  /** The shadow of something in the air: the ground under it is drawn a tone darker. */
  function drawShadow(to, x, y, z) {
    const drop = z - groundAt(world, x, y)
    const sx = x + SUN_X * drop
    const sy = y + SUN_Y * drop
    if (!project(cam, sx, sy, groundAt(world, sx, sy))) return
    const rx = 6 * cam.scale
    const ry = rx * (cam.persp > 0 ? 0.5 : 0.8)
    if (rx < 1.5 || rx > 30) return
    const cx = Math.round(cam.sx)
    const cy = Math.round(cam.sy)
    for (let py = Math.max(0, Math.ceil(cy - ry)); py <= Math.min(to.height - 1, cy + ry); py++) {
      for (let px = Math.max(0, Math.ceil(cx - rx)); px <= Math.min(to.width - 1, cx + rx); px++) {
        if (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 > 1) continue
        const at = py * to.width + px
        if (Math.abs(to.depth[at] - cam.depth) < 6) to.color[at] = tint(to.color[at], 0.6, 0.66, 0.84)
      }
    }
  }

  /** The enemies and their shadows. */
  function drawPilots(to) {
    for (let n = 0; n < fight.pilots.length; n++) {
      const pilot = fight.pilots[n]
      if (pilot.state === 1) drawShadow(to, pilot.x, pilot.y, pilot.z)
    }
    for (let n = 0; n < fight.pilots.length; n++) {
      const pilot = fight.pilots[n]
      if (pilot.state === 0) continue
      foe.x = pilot.x
      foe.y = pilot.y
      foe.z = pilot.z
      foe.yaw = pilot.yaw
      foe.roll = pilot.roll
      foe.pitch = pilot.pitch
      foe.thrust = pilot.state === 2 ? 0 : 0.5
      // one that comes right up to the eye dissolves, as the ship does
      foe.solid = project(cam, pilot.x, pilot.y, pilot.z) ? clamp((eyeDistance(cam) - 10) / 16, 0, 1) : 0
      drawStack(to, cam, pilot.flash > 0 ? rivalHit : rival, foe, time + n)
    }
  }

  /** Every round and missile in the air, and the flash at the guns. */
  function drawShots(to) {
    const shots = fight.shots
    for (let o = 0; o < fight.shotCount * fight.shotSize; o += fight.shotSize) {
      if (shots[o + 6] <= 0 || !project(cam, shots[o], shots[o + 1], shots[o + 2]) || eyeDistance(cam) < 6) continue
      const x1 = cam.sx
      const y1 = cam.sy
      const near = cam.depth - 2
      const thick = cam.scale > 1.7 ? 2 : 1
      // its tail is where it was a moment ago
      if (!project(cam, shots[o] - shots[o + 3] * 0.035, shots[o + 1] - shots[o + 4] * 0.035, shots[o + 2] - shots[o + 5] * 0.035)) continue
      const tones = shots[o + 7] === 0 ? ROUND_OURS : ROUND_THEIRS
      stroke(to, cam.sx, cam.sy, x1, y1, near, tones[0], tones[1], thick)
    }
    for (let kind = 0; kind < 2; kind++) {
      const list = kind === 0 ? fight.missiles : fight.inbound
      for (let n = 0; n < list.length; n++) {
        const missile = list[n]
        if (!missile.on || !project(cam, missile.x, missile.y, missile.z) || eyeDistance(cam) < 6) continue
        const x1 = cam.sx
        const y1 = cam.sy
        const near = cam.depth - 2
        const thick = cam.scale > 1.4 ? 2 : 1
        if (!project(cam, missile.x - missile.fx * 6, missile.y - missile.fy * 6, missile.z - missile.fz * 6)) continue
        const x0 = cam.sx
        const y0 = cam.sy
        const body = kind === 0 ? MISSILE_OURS : ((time * 12) & 1) === 0 ? WHITE : MISSILE_THEIRS
        stroke(to, x0, y0, x1, y1, near, body, body, thick)
        if (kind === 1 || missile.age > FIGHT.missileDrop) stroke(to, x0, y0, x0 - (x1 - x0) * 0.5, y0 - (y1 - y0) * 0.5, near, MISSILE_FLAME, MISSILE_FLAME, thick)
      }
    }
    if (fight.muzzle > 0.35 && !gone) {
      const gun = plane.guns[fight.muzzleSide > 0 ? 1 : 0]
      const x = craft.x + (gun.a * axes.rx + (gun.b + 4) * axes.fx + gun.z * axes.ux)
      const y = craft.y + (gun.a * axes.ry + (gun.b + 4) * axes.fy + gun.z * axes.uy)
      const z = craft.z + (gun.a * axes.rz + (gun.b + 4) * axes.fz + gun.z * axes.uz)
      if (project(cam, x, y, z) && eyeDistance(cam) > 4) {
        const size = Math.max(1, Math.round(cam.scale))
        const cx = Math.round(cam.sx)
        const cy = Math.round(cam.sy)
        stroke(to, cx - size, cy, cx + size, cy, cam.depth - 3, ROUND_OURS[1], ROUND_OURS[1], 1)
        stroke(to, cx, cy - size, cx, cy + size, cam.depth - 3, ROUND_OURS[1], ROUND_OURS[1], 1)
      }
    }
  }

  /** Draws one frame and returns the framebuffer (see framebuffer.js). */
  function render() {
    // A banked view is drawn upright on the sheet and then turned into the frame (roll.js).
    // While it is drawn, the camera is centred on the sheet's pivot instead of the frame's.
    const banked = Math.abs(viewRoll) > 0.0015
    const to = banked ? sheet : fb
    const cx = cam.cx
    const cy = cam.cy
    if (banked) {
      fitSheet(sheet, fb.width, fb.height, cx, cy, viewRoll)
      cam.cx = sheet.cx
      cam.cy = sheet.cy
    }
    const city = inCity()
    to.clear()
    caster.footprint = model.footprint
    caster.width = model.width
    caster.length = model.length
    caster.pivotK = model.pivotK
    caster.x = craft.x
    caster.y = craft.y
    caster.z = craft.z
    caster.cos = Math.cos(craft.yaw)
    caster.sin = Math.sin(craft.yaw)
    caster.across = 1 / (Math.max(0.3, Math.abs(Math.cos(pose.roll))) * pose.scale)
    caster.along = 1 / pose.scale
    drawWorld(to, cam, world, time, gone ? null : caster)
    drawSky(to, cam, world, fb.height * 0.7)
    drawStreaks(to)
    if (!gone) drawTrails(to)
    fx.drawSmoke(to, cam)
    if (city) drawPilots(to)
    if (city) drawShots(to)
    fx.drawBlasts(to, cam) // before the ship, which flies out of the fire and is never lost in it
    if (form === 0 || form === 1) drawStack(to, cam, city && fight.hurt < 0.09 ? planeHit : model, pose, time)
    else {
      // Between shapes: the slices of both pull apart and twirl, and one dissolves into the other.
      const solid = pose.solid
      const roll = pose.roll
      pose.spread = 1 + 2.4 * Math.sin(Math.PI * form)
      pose.roll = roll + Math.PI * 2 * inOut(form)
      pose.solid = solid * (1 - form)
      drawStack(to, cam, rocket, pose, time)
      pose.solid = solid * form
      drawStack(to, cam, plane, pose, time)
      pose.solid = solid
      pose.roll = roll
      pose.spread = 1
    }
    if (banked) {
      cam.cx = cx
      cam.cy = cy
      pasteRolled(fb, sheet, cx, cy, viewRoll)
    }

    // The haze between levels: more and more pixels of it, in a dither pattern, then fewer.
    // A flash is the same thing in white: a blast close by, a hit, the moment the ship changes shape.
    if (cover > 0 || feel.flash > 0) {
      const haze = world.palette.haze
      const ink = cover * 17
      const lit = Math.min(3, feel.flash * 7) // a sixth of the pixels at most: the fight must still be seen through it
      const W = fb.width
      for (let y = 0; y < fb.height; y++) {
        for (let x = 0, o = y * W; x < W; x++, o++) {
          const grain = BAYER4[((y & 3) << 2) | (x & 3)]
          if (ink > grain) fb.color[o] = haze
          else if (lit > 15 - grain) fb.color[o] = WHITE
        }
      }
    }

    const door = shiftWay === 0 && level < doors.length ? doors[level] : null
    hud.city = city && fight.round > 0
    hud.slow = slow
    hud.roll = viewRoll
    hud.seat = inCockpit.at
    hud.time = time
    hud.door = door
    if (door) {
      hud.doorX = craft.x + doorGap(0)
      hud.doorY = craft.y + doorGap(1)
      hud.over = overDoor()
    }
    drawUnder(fb, cam, world, hud)
    if (inCockpit.at > 0.4) {
      gauges.speed = speed
      gauges.altitude = craft.z
      gauges.heading = craft.yaw
      gauges.turn = clamp(craft.yawRate / tune.turnRate, -1, 1)
      gauges.climb = clamp(climbRate / (tune.speed * 0.5), -1, 1)
      gauges.boost = boost
      gauges.roll = viewRoll
      gauges.pitch = craft.pitch
      gauges.horizon = -(cam.zoom * cam.tilt) / cam.persp // rows from the middle of the view down to the horizon
      gauges.low = craft.z - floor < 2
      gauges.rolling = craft.spin >= 0
      gauges.idle = !handsOn
      gauges.time = time
      gauges.city = city && form === 1
      gauges.wraps = level === 0
      gauges.threat = fight.threatIn < 90
      gauges.hull = fight.hull
      gauges.hullMax = FIGHT.hull
      gauges.score = fight.score
      gauges.rails = fight.rails
      gauges.railsMax = FIGHT.rails
      let blips = 0
      if (door) {
        gauges.blips[0] = craft.x + doorGap(0)
        gauges.blips[1] = craft.y + doorGap(1)
        gauges.blips[2] = 4
        blips = 1
      }
      if (city) {
        for (let n = 0; n < fight.pilots.length; n++) {
          const pilot = fight.pilots[n]
          if (pilot.state !== 1) continue
          gauges.blips[blips * 3] = pilot.x
          gauges.blips[blips * 3 + 1] = pilot.y
          gauges.blips[blips * 3 + 2] = pilot.attacking ? 2 : 1
          blips++
        }
        for (let n = 0; n < fight.inbound.length; n++) {
          const missile = fight.inbound[n]
          if (!missile.on) continue
          gauges.blips[blips * 3] = missile.x
          gauges.blips[blips * 3 + 1] = missile.y
          gauges.blips[blips * 3 + 2] = 3
          blips++
        }
      }
      gauges.blipCount = blips
      cockpit.draw(fb, cam, world, craft, gauges, (inCockpit.at - 0.4) / 0.6)
    }

    hud.level = level
    hud.name = LEVELS[level].name
    hud.noteId = feel.noteId
    hud.noteN = feel.noteN
    hud.noteAge = feel.noteAge
    hud.canRestart = canRestart()
    hud.threatAngle = fight.threatFrom + craft.yaw - cam.heading
    hud.sightOn = armed()
    if (hud.sightOn) {
      // where the guns point: further ahead from behind, nearer from above so it stays in the picture
      const ahead = Math.min(140, Math.min(fb.width, fb.height) * 0.34) * (1 - inChase.at) + 140 * inChase.at
      hud.sightX = craft.x + Math.sin(craft.yaw) * ahead
      hud.sightY = craft.y - Math.cos(craft.yaw) * ahead
      hud.sightZ = craft.z
    }
    drawHud(fb, cam, world, hud)
    return fb
  }

  /** Starts the way down to the next level. Only over a marked place; says whether it did. */
  function descend() {
    if (shiftWay !== 0 || !overDoor()) return false
    shiftWay = 1
    shiftAt = 0
    swapped = false
    return true
  }

  /** Starts the way up a level. Says whether it did. */
  function ascend() {
    if (shiftWay !== 0 || level === 0) return false
    shiftWay = -1
    shiftAt = 0
    swapped = false
    return true
  }

  if (inCity()) fight.begin(craft, world)
  frameCamera(0, 0, 0)

  return {
    /** the model of the shape the ship has, or is nearer to */
    get model() {
      return model
    },
    models: { rocket, plane, rival },
    /** 'rocket', 'plane', or 'changing' while it is between the two */
    get form() {
      return form === 0 ? 'rocket' : form === 1 ? 'plane' : 'changing'
    },
    craft,
    camera: cam,
    frame: fb,
    doors,
    fight,
    /** counts of what has happened, for the page to play as sound */
    heard,
    update,
    render,
    descend,
    ascend,
    restart,
    roll,
    resize(width, height) {
      fb.resize(width, height)
      sizeSheet(sheet, fb.width, fb.height)
      cockpit.resize(fb.width, fb.height)
      settle()
    },
    /** pointer position in game pixels (screen pixels ÷ the pixel size) */
    pointerMove(x, y) {
      input.x = x
      input.y = y
      input.pointing = true
      input.idle = 0
      input.byKeys = false
    },
    pointerLeave() {
      input.pointing = false
      input.held = false
    },
    press() {
      input.held = true
      input.heldFor = 0
    },
    release() {
      // A click, not a hold: a roll, or a new fight once the last one is over.
      if (input.held && input.heldFor < tune.holdSeconds && !restart()) roll()
      input.held = false
    },
    /** turn and climb are −1..1 */
    setKeys(turn, climb, boostHeld) {
      input.turn = clamp(turn, -1, 1)
      input.climb = clamp(climb, -1, 1)
      input.boost = !!boostHeld
      if (turn !== 0 || climb !== 0) input.byKeys = true
    },
    /** The trigger, from a key: the cannon fires for as long as it is held. */
    setTrigger(held) {
      if (held && !input.trigger) restart()
      input.trigger = !!held
    },
    /** The missile button. Says whether a missile left. */
    missile() {
      return armed() ? fight.launch(craft) : false
    },
    /** With this on, missiles leave by themselves once they have a lock: for one-button play. */
    setAssist(on) {
      fight.assist = !!on
    },
    /** swaps up and down on the keys and the pointer, or swaps them back */
    toggleInvert() {
      inverted = !inverted
    },
    /** true when up and down are swapped, as in a plane */
    get inverted() {
      return inverted
    },
    /** steps to the next view: overhead → chase → cockpit → overhead */
    nextView() {
      goal = (goal + 1) % VIEWS.length
    },
    /** 'top', 'chase' or 'cockpit' */
    setView(name) {
      goal = Math.max(0, VIEWS.indexOf(name))
    },
    /** the map of the level the ship is on */
    get world() {
      return world
    },
    /** 0 is the Earth, 1 the country, 2 the city */
    get level() {
      return level
    },
    /** 'none', or 'down' or 'up' while the level is changing */
    get shift() {
      return shiftWay > 0 ? 'down' : shiftWay < 0 ? 'up' : 'none'
    },
    /** true once a change of level has swapped the map and is drawing back */
    get arrived() {
      return shiftWay !== 0 && swapped
    },
    /** true when DOWN would work: the ship is over this level's marked place */
    get canDescend() {
      return shiftWay === 0 && overDoor()
    },
    /** true while the plane can fire: it is a plane, over the city, in a fight that is not over */
    get armed() {
      return armed()
    },
    /** true once a fight is over and its end has played out: a click starts a new one */
    get canRestart() {
      return canRestart()
    },
    /** the view the camera is in, or is on its way to */
    get view() {
      return VIEWS[goal]
    },
    /** 0..1: how much of the chase pose the camera has right now */
    get chaseAmount() {
      return inChase.at
    },
    /** 0..1: how much of the cockpit pose the camera has right now */
    get cockpitAmount() {
      return inCockpit.at
    },
    /** radians: how far the picture is banked right now */
    get viewRoll() {
      return viewRoll
    },
    /** 0..1: how far time is slowed right now */
    get slow() {
      return slow
    },
    /** 0..1: how hard the picture is shaking */
    get shake() {
      return feel.shake
    },
    /** 0..1: how bright the flash over the picture is */
    get flash() {
      return feel.flash
    },
    /** seconds until an enemy missile arrives, or 99 */
    get threat() {
      return fight.threatIn
    },
    get speed() {
      return speed
    },
    get time() {
      return time
    },
    get boost() {
      return boost
    },
  }
}
