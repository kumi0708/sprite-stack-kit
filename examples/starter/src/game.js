// The game: how the craft flies, where the camera sits, and the order things are drawn in.
// It knows nothing about the page. main.js feeds it input and shows its picture, and
// scripts/snapshot.mjs runs it with no browser at all.

import { createFramebuffer, BAYER4 } from './framebuffer.js'
import { createCamera, project, aimCamera, eyeDistance } from './camera.js'
import { buildWorld, groundAt, CLOUD_BASE, TOP_Z } from './world.js'
import { drawWorld, drawSky } from './terrain.js'
import { buildCraft } from './model.js'
import { drawStack, stackAxes } from './stack.js'
import { createSheet, sizeSheet, fitSheet, pasteRolled } from './roll.js'
import { createCockpit } from './cockpit.js'

export const TUNING = {
  speed: 84, // world px per second
  boost: 1.7, // × speed while the thrusters are open
  turnRate: 1.4, // radians per second at full deflection
  bank: 0.8, // radians of bank at full turn rate
  altitude: 58, // cruising height
  ceiling: 230,
  clearance: 9, // the closest the craft comes to the ground
  viewSeconds: 1.2, // a view change is nearly done after this long, then settles gently
  cameraFollow: 0.5, // overhead: how much of the craft's turn the camera makes with it
  chaseDistance: 130, // world px from the eye to the craft
  chaseAngle: 15, // degrees the chase eye looks down
  chaseWidth: 0.21, // how wide the craft is in the chase view, as a share of the frame
  cockpitLook: 50, // world px from the cockpit eye to the point ahead that it looks at
  cockpitEye: 2.5, // how far above the craft's centre the cockpit eye sits
  cockpitLens: 0.62, // the cockpit lens, as a share of the frame's longer side; shorter sees wider
  cockpitPitch: 0.6, // how much of the craft's pitch the cockpit view shows; 1 is true to life
  cockpitRoll: 1, // … and how much of its bank
  holdSeconds: 0.22, // a shorter press is a click (roll); a longer one opens the thrusters
  rollSeconds: 0.75,
  trailSeconds: 2,
}

/** The views, in the order the VIEW button steps through them. */
export const VIEWS = ['top', 'chase', 'cockpit']

const TRAIL_POINTS = 120
const TRAIL_GAP = 3 // world px between trail points
// The craft dissolves as the eye comes up to it.
const FADE_NEAR = 30 // gone when the eye is this close, in world px …
const FADE_FAR = 70 // … and solid from here out
const FADE_SHARE = 0.54 // … or from this share of the chase distance, so a close chase camera still shows a solid craft

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
  // `world` is how much land and cloud to make, or a world that is already built: tools that
  // start many games on one seed pass the first game's world to the rest.
  const world = options.world?.heights ? options.world : buildWorld(options.seed ?? 7, options.world)
  const model = buildCraft()
  const tune = { ...TUNING, ...options.tuning, craftWidth: model.width }
  const fadeFar = Math.min(FADE_FAR, tune.chaseDistance * FADE_SHARE)
  const fadeNear = fadeFar * (FADE_NEAR / FADE_FAR)
  const fb = createFramebuffer()
  const sheet = createSheet() // a bigger picture: the world is drawn on it when the view is banked
  const cockpit = createCockpit()
  const cam = createCamera()
  const axes = {}

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
  }
  const input = { x: 0, y: 0, pointing: false, idle: 99, held: false, heldFor: 0, turn: 0, climb: 0, boost: false, byKeys: false }
  const focus = { x: craft.x, y: craft.y, alt: craft.z } // what the overhead and chase views look at
  const look = { x: craft.x, y: craft.y, alt: craft.z } // what the camera looks at: the three views mixed
  const pose = { x: 0, y: 0, z: 0, yaw: 0, roll: 0, pitch: 0, scale: 1, spread: 1, thrust: 0, solid: 1 }
  const caster = {
    x: 0, y: 0, z: 0, cos: 1, sin: 0, across: 1, along: 1,
    footprint: model.footprint, width: model.width, length: model.length, pivotK: model.pivotK,
  }
  // what the cockpit's instruments show
  const gauges = { speed: 0, altitude: 0, heading: 0, turn: 0, climb: 0, boost: 0, roll: 0, pitch: 0, horizon: 0, low: false, rolling: false, idle: false, time: 0 }
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
  let floor = 0 // the lowest the craft may fly right now
  let climbRate = 0
  // Inverted controls, as in a plane: pushing up (W, the up arrow, or pointing above the
  // craft) dives, and pulling down climbs.
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
  let viewRoll = 0 // how far the picture is banked: the craft's roll, in the cockpit only
  let spread = 1
  let spreadGoal = 1

  const spinAngle = () => (craft.spin < 0 ? 0 : craft.spinDir * Math.PI * 2 * inOut(craft.spin))

  /** The tallest ground the craft will pass over in the next moment, across its wingspan. */
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

  /**
   * Works out what the camera looks at, which way, and how steeply, from how much of each
   * view it has. `vx` and `vy` are the craft's speed over the ground.
   */
  function frameCamera(dt, vx, vy) {
    const chase = inChase.at
    const seat = inCockpit.at
    const top = Math.max(0, 1 - chase - seat) // how much of the overhead pose is left
    const behind = 1 - top

    // The overhead and chase views look at a point that trails the craft, and that sits a
    // little ahead of it when seen from above.
    const lead = (20 + 14 * boost) * top
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

    // The cockpit view does not trail anything: its eye is fixed in the craft. It looks at a
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
    // In the cockpit the eye is the craft, which keeps itself clear, so the lift fades out.
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
    pose.spread = spread
    pose.thrust = 0.35 + 0.65 * boost
    stackAxes(pose.yaw, pose.roll, pose.pitch, axes)
    aimCamera(cam, inChase.at, inCockpit.at, look, heading, tilt, fb.width, fb.height, tune)
    // The craft dissolves as the eye comes up to it, and is gone before the eye is inside it.
    const away = project(cam, craft.x, craft.y, craft.z) ? eyeDistance(cam) : 0
    pose.solid = clamp((away - fadeNear) / (fadeFar - fadeNear), 0, 1)
  }

  function update(seconds) {
    const dt = clamp(seconds, 0, 0.05)
    if (dt <= 0) return
    time += dt
    input.idle += dt
    if (input.held) input.heldFor += dt

    // thrusters
    const pushing = (input.held && input.heldFor >= tune.holdSeconds) || input.boost
    boost += ((pushing ? 1 : 0) - boost) * ease(dt, pushing ? 5 : 2.5)
    speed = tune.speed * (1 + (tune.boost - 1) * boost)
    const climbMax = speed * 0.5

    // ── what the player is asking for
    const behind = inChase.at + inCockpit.at > 0.5 // steering from behind the craft, or from inside it
    const pointing = input.pointing && input.idle < 6 && !input.byKeys
    // Where the craft is on screen. In the cockpit the eye is inside it, so the middle of the
    // view stands in.
    let craftX = cam.cx
    let craftY = cam.cy
    if (inCockpit.at < 0.5 && project(cam, craft.x, craft.y, craft.z)) {
      craftX = cam.sx
      craftY = cam.sy
    }
    let want = 0
    handsOn = true
    if (input.turn !== 0) {
      want = input.turn * tune.turnRate
    } else if (pointing && behind) {
      // from behind: point left or right of the craft to turn
      const t = clamp((input.x - cam.cx) / (fb.width * 0.28), -1, 1)
      if (Math.abs(t) > 0.06) want = t * tune.turnRate
    } else if (pointing) {
      // from above: the craft turns to face the pointer
      const px = input.x - craftX
      const py = input.y - craftY
      if (px * px + py * py > 14 * 14) {
        const wx = px * cam.cos - py * cam.sin // the same direction on the map
        const wy = px * cam.sin + py * cam.cos
        want = clamp(wrap(Math.atan2(wx, -wy) - craft.yaw) * 2.5, -tune.turnRate, tune.turnRate)
      }
    } else if (!input.byKeys) {
      // nobody at the controls: wander, so the scene is never still
      want = tune.turnRate * (0.55 * Math.sin(time * 0.37) + 0.35 * Math.sin(time * 0.83 + 2))
      handsOn = false
    }
    const upward = inverted ? -1 : 1
    if (input.climb !== 0) {
      altGoal += input.climb * upward * climbMax * dt
    } else if (pointing && behind) {
      // from behind: point above the craft to climb, below it to dive
      const raw = upward * clamp((craftY - input.y) / (fb.height * 0.4), -1, 1)
      const up = (Math.sign(raw) * Math.max(0, Math.abs(raw) - 0.08)) / 0.92
      altGoal = up >= 0 ? tune.altitude + up * (tune.ceiling - tune.altitude) : tune.altitude + up * (tune.altitude - floor)
    } else if (!handsOn) {
      altGoal += (tune.altitude - altGoal) * ease(dt, 0.8)
    }

    // ── flight
    craft.yawRate += (want - craft.yawRate) * ease(dt, 2.8)
    craft.yaw += craft.yawRate * dt
    const bank = clamp(craft.yawRate / tune.turnRate, -1, 1) * tune.bank
    craft.roll += (bank - craft.roll) * ease(dt, 5)
    const vx = Math.sin(craft.yaw) * speed
    const vy = -Math.cos(craft.yaw) * speed
    craft.x += vx * dt
    craft.y += vy * dt
    if (craft.spin >= 0) {
      craft.spin += dt / tune.rollSeconds
      if (craft.spin >= 1) craft.spin = -1
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
    craft.pitch += (clamp(climbRate / Math.max(20, speed), -0.5, 0.5) - craft.pitch) * ease(dt, 4)

    spread += (spreadGoal - spread) * ease(dt, 7)

    // ── the view: each pose's share glides to 1 or to 0, and the camera follows
    const pull = 4.6 / tune.viewSeconds
    glide(inChase, goal === 1 ? 1 : 0, pull, dt)
    glide(inCockpit, goal === 2 ? 1 : 0, pull, dt)
    frameCamera(dt, vx, vy)
    settle()

    // wingtip trails: drop a point every few pixels flown
    const moved = (craft.x - trailX) ** 2 + (craft.y - trailY) ** 2
    if (moved > TRAIL_GAP * TRAIL_GAP) {
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
    if (spread > 1.5) return
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
    to.clear()
    caster.x = craft.x
    caster.y = craft.y
    caster.z = craft.z
    caster.cos = Math.cos(craft.yaw)
    caster.sin = Math.sin(craft.yaw)
    caster.across = 1 / (Math.max(0.3, Math.abs(Math.cos(pose.roll))) * pose.scale)
    caster.along = 1 / pose.scale
    drawWorld(to, cam, world, time, spread < 1.5 ? caster : null)
    drawSky(to, cam, world, fb.height * 0.7)
    drawTrails(to)
    drawStack(to, cam, model, pose, time)
    if (banked) {
      cam.cx = cx
      cam.cy = cy
      pasteRolled(fb, sheet, cx, cy, viewRoll)
    }

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
      cockpit.draw(fb, cam, world, craft, gauges, (inCockpit.at - 0.4) / 0.6)
    }
    return fb
  }

  frameCamera(0, 0, 0)

  return {
    world,
    model,
    craft,
    camera: cam,
    frame: fb,
    update,
    render,
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
      if (input.held && input.heldFor < tune.holdSeconds) this.roll() // a click, not a hold
      input.held = false
    },
    /** turn and climb are −1..1 */
    setKeys(turn, climb, boostHeld) {
      input.turn = clamp(turn, -1, 1)
      input.climb = clamp(climb, -1, 1)
      input.boost = !!boostHeld
      if (turn !== 0 || climb !== 0) input.byKeys = true
    },
    roll() {
      if (craft.spin >= 0) return
      craft.spin = 0
      craft.spinDir = craft.yawRate >= 0 ? 1 : -1
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
    /** pulls the slices of the stack apart, or puts them back */
    toggleSpread() {
      spreadGoal = spreadGoal === 1 ? 4 : 1
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
    /** 1 when the stack is solid, up to 4 when its slices are pulled apart */
    get spread() {
      return spread
    },
    get time() {
      return time
    },
    get boost() {
      return boost
    },
  }
}
