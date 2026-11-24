// The page: fits the canvas, passes input to the game, and shows each frame.

import { createGame } from './game.js'

// ?seed=3 picks the world, ?view=chase or ?view=cockpit picks the view to start in, and
// ?invert=1 or ?invert=0 turns the up/down swap on or off. Otherwise the swap is as the
// player last left it on this browser.
const query = new URLSearchParams(location.search)
const SAVED = 'starter-invert'
const remembered = (() => {
  try {
    return localStorage.getItem(SAVED) === '1'
  } catch {
    return false
  }
})()
const game = createGame({
  seed: Number(query.get('seed')) || 7,
  view: query.get('view') ?? 'top',
  invert: query.has('invert') ? query.get('invert') === '1' : remembered,
})
const canvas = document.getElementById('game')
const ctx = canvas.getContext('2d')
const hint = document.getElementById('hint')
const viewButton = document.getElementById('view')
const invertButton = document.getElementById('invert')

const touch = matchMedia('(pointer: coarse)').matches
// What moves the craft up and down, in words, for the hints: it depends on the up/down swap.
const climbWords = (inverted) => (touch ? (inverted ? 'DRAG DOWN TO CLIMB' : 'DRAG UP TO CLIMB') : inverted ? 'S TO CLIMB, W TO DIVE' : 'W TO CLIMB, S TO DIVE')
const pointWords = (inverted) => (inverted ? 'POINT LOW TO CLIMB' : 'POINT HIGH TO CLIMB')
const hints = (inverted) =>
  touch
    ? {
        top: 'DRAG TO STEER · TAP TO ROLL · HOLD FOR THRUSTERS · VIEW FOR THE CHASE VIEW',
        chase: `DRAG TO STEER · ${climbWords(inverted)} · TAP TO ROLL · HOLD FOR THRUSTERS · VIEW FOR THE COCKPIT`,
        cockpit: `DRAG TO STEER · ${climbWords(inverted)} · VIEW FOR THE OVERHEAD VIEW`,
      }
    : {
        top: `MOVE TO STEER · CLICK TO ROLL · HOLD FOR THRUSTERS · ${climbWords(inverted)} · SPACE FOR CHASE VIEW · E TO PULL THE STACK APART · I TO SWAP UP AND DOWN`,
        chase: `POINT TO STEER · ${pointWords(inverted)} · CLICK TO ROLL · HOLD FOR THRUSTERS · SPACE FOR THE COCKPIT · I TO SWAP UP AND DOWN`,
        cockpit: `POINT TO STEER · ${pointWords(inverted)} · CLICK TO ROLL · HOLD FOR THRUSTERS · SPACE FOR OVERHEAD VIEW · I TO SWAP UP AND DOWN`,
      }
let HINTS = hints(game.inverted)

/** Shows the up/down swap on its button and in the hints, and remembers it on this browser. */
function showInvert() {
  invertButton.textContent = game.inverted ? 'INVERT: ON' : 'INVERT: OFF'
  invertButton.setAttribute('aria-pressed', String(game.inverted))
  HINTS = hints(game.inverted)
  shownView = '' // the hint is redrawn on the next frame
  try {
    localStorage.setItem(SAVED, game.inverted ? '1' : '0')
  } catch {}
}
function toggleInvert() {
  game.toggleInvert()
  showInvert()
}

let pixel = 3 // screen pixels per game pixel
let image = null
let shownView = ''

function fit() {
  // A whole number of screen pixels per game pixel, chosen so the picture is about 400 wide.
  pixel = Math.max(2, Math.min(8, Math.round(Math.min(innerWidth / 400, innerHeight / 250))))
  const width = Math.ceil(innerWidth / pixel)
  const height = Math.ceil(innerHeight / pixel)
  canvas.width = width
  canvas.height = height
  canvas.style.width = width * pixel + 'px'
  canvas.style.height = height * pixel + 'px'
  game.resize(width, height)
  // The ImageData wraps the game's own memory, so showing a frame copies nothing extra.
  image = new ImageData(game.frame.bytes, game.frame.width, game.frame.height)
}

let last = 0
function tick(now) {
  const dt = last ? (now - last) / 1000 : 0
  last = now
  game.update(dt)
  game.render()
  ctx.putImageData(image, 0, 0)
  if (game.view !== shownView) {
    shownView = game.view
    hint.textContent = HINTS[shownView]
    hint.classList.toggle('high', shownView === 'cockpit')
  }
  requestAnimationFrame(tick)
}

// ── pointer: mouse, pen and touch all arrive as pointer events
canvas.addEventListener('pointermove', (e) => game.pointerMove(e.clientX / pixel, e.clientY / pixel))
canvas.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return
  canvas.setPointerCapture(e.pointerId)
  game.pointerMove(e.clientX / pixel, e.clientY / pixel)
  game.press()
})
canvas.addEventListener('pointerup', () => game.release())
canvas.addEventListener('pointercancel', () => game.pointerLeave())
canvas.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') game.pointerLeave()
})
canvas.addEventListener('contextmenu', (e) => e.preventDefault())
viewButton.addEventListener('click', () => game.nextView())
invertButton.addEventListener('click', toggleInvert)

// ── keys
const held = new Set()
const down = (...codes) => codes.some((code) => held.has(code))
function sendKeys() {
  game.setKeys(
    (down('ArrowRight', 'KeyD') ? 1 : 0) - (down('ArrowLeft', 'KeyA') ? 1 : 0),
    (down('ArrowUp', 'KeyW') ? 1 : 0) - (down('ArrowDown', 'KeyS') ? 1 : 0),
    down('ShiftLeft', 'ShiftRight'),
  )
}
addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return
  if (e.code === 'Space') {
    e.preventDefault()
    if (!e.repeat) game.nextView()
  } else if (e.code === 'KeyE') {
    if (!e.repeat) game.toggleSpread()
  } else if (e.code === 'KeyI') {
    if (!e.repeat) toggleInvert()
  } else if (e.code === 'KeyR') {
    if (!e.repeat) game.roll()
  } else {
    if (e.code.startsWith('Arrow')) e.preventDefault()
    held.add(e.code)
    sendKeys()
  }
})
addEventListener('keyup', (e) => {
  held.delete(e.code)
  sendKeys()
})
addEventListener('blur', () => {
  held.clear()
  sendKeys()
  game.pointerLeave()
})
addEventListener('resize', fit)

showInvert()
fit()
requestAnimationFrame(tick)
