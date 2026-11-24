#!/usr/bin/env bun
// Checks a game with no browser.
//
//   bun run check                              # the starter
//   bun run check --game examples/my-game      # a copy of the starter that keeps its file names
//   bun test                                   # the same checks, through Bun's test runner
//
// Each check is one promise the kit makes, so a change that breaks a promise fails here.

import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { gzipSync } from 'node:zlib'
import { runStates } from './states.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function checksum(words) {
  let h = 2166136261
  for (let i = 0; i < words.length; i++) h = Math.imul(h ^ words[i], 16777619)
  return h >>> 0
}
function fly(game, frames, each) {
  for (let i = 0; i < frames; i++) {
    game.update(1 / 60)
    if (each) each(i)
  }
  return game.render()
}

/** Runs every check on the game in `game` (a folder, relative to the kit) and returns [{ name, ok, detail }]. */
export async function runChecks({ game: folder = 'examples/starter' } = {}) {
  const gameDir = resolve(root, folder)
  const load = (file) => import(pathToFileURL(join(gameDir, 'src', file)).href)
  const { createGame, TUNING, VIEWS } = await load('game.js')
  const { createCamera, project, horizonRow } = await load('camera.js')
  const { EMPTY, BAYER4, createFramebuffer } = await load('framebuffer.js')
  const { buildWorld, groundAt, GROUND_MAX, CLOUD_LAYERS, MAT, LAND_SHARE } = await load('world.js')
  const { sculptGrid, encodeGrid, decodeGrid, buildCraft, CRAFT_W, CRAFT_L, CRAFT_H } = await load('model.js')

  const results = []
  const check = (name, ok, detail = '') => results.push({ name, ok: !!ok, detail })
  const emptyPixels = (frame) => {
    let empty = 0
    for (let i = 0; i < frame.color.length; i++) if (frame.color[i] === EMPTY || frame.color[i] >>> 24 !== 255) empty++
    return empty
  }
  // where the camera's eye is in the world
  const eyeOf = (cam) => ({ x: cam.x - cam.sin / cam.persp, y: cam.y + cam.cos / cam.persp, z: cam.alt + cam.tilt / cam.persp })

  // ── the model
  const grid = sculptGrid()
  const model = buildCraft()
  check('model: the encoded form decodes back to the same grid', checksum(decodeGrid(encodeGrid(grid), grid.length)) === checksum(grid))
  check('model: has a solid number of cells', model.cells > 100, `${model.cells} cells, ${encodeGrid(grid).length} characters encoded`)
  let mirrored = true
  for (let z = 0; z < CRAFT_H && mirrored; z++) {
    for (let k = 0; k < CRAFT_L && mirrored; k++) {
      for (let i = 0; i < CRAFT_W; i++) {
        const a = grid[(z * CRAFT_L + k) * CRAFT_W + i] !== 0
        const b = grid[(z * CRAFT_L + k) * CRAFT_W + (CRAFT_W - 1 - i)] !== 0
        if (a !== b) mirrored = false
      }
    }
  }
  check('model: left and right halves match', mirrored)

  // ── the world
  const world = buildWorld(7)
  const again = buildWorld(7)
  const other = buildWorld(8)
  check('world: the same seed gives the same world', checksum(world.heights) === checksum(again.heights) && checksum(world.cloudMap) === checksum(again.cloudMap))
  check('world: a different seed gives a different world', checksum(world.heights) !== checksum(other.heights))
  let land = 0
  let tallest = 0
  let thickest = 0
  for (let i = 0; i < world.heights.length; i++) {
    if (world.materials[i] >= MAT.SAND) land++
    if (world.heights[i] > tallest) tallest = world.heights[i]
  }
  for (let i = 0; i < world.cloudMap.length; i++) if (world.cloudMap[i] > thickest) thickest = world.cloudMap[i]
  const share = land / world.heights.length
  // a world with no sea (a desert, a city) exports no share to hold it to
  if (LAND_SHARE !== undefined) check('world: land covers the share that was asked for', Math.abs(share - LAND_SHARE) < 0.02, `${(share * 100).toFixed(1)}% land`)
  check('world: nothing is taller than the renderer allows', tallest <= GROUND_MAX && thickest <= CLOUD_LAYERS, `ground ${tallest}/${GROUND_MAX}, cloud ${thickest}/${CLOUD_LAYERS}`)

  // ── the camera
  const cam = createCamera()
  Object.assign(cam, { x: 100, y: 100, alt: 20, cx: 160, cy: 120 })
  project(cam, 100, 100, 20)
  check('camera: the focus lands on its screen anchor', cam.sx === 160 && cam.sy === 120)
  project(cam, 100, 100, 30)
  const upTen = cam.sy
  project(cam, 100, 90, 20)
  check('camera: in the flat view, one layer of height and one pixel of depth each move one pixel up', upTen === 110 && cam.sy === 110)
  check('camera: the flat view has no horizon', horizonRow(cam) < -1e6)

  // ── drawing
  for (const [width, height] of [[384, 240], [200, 420], [640, 360]]) {
    for (const view of VIEWS) {
      const game = createGame({ seed: 7, view })
      game.resize(width, height)
      const frame = fly(game, 90)
      const empty = emptyPixels(frame)
      let outline = 0
      for (let i = 0; i < frame.color.length; i++) if (frame.color[i] === game.model.outline) outline++
      if (view === 'cockpit') {
        check(`draw: cockpit view at ${width}×${height} fills every pixel, and the craft is out of sight`, empty === 0 && outline === 0, `${empty} empty, ${outline} outline pixels`)
      } else {
        check(`draw: ${view} view at ${width}×${height} fills every pixel and shows the craft`, empty === 0 && outline > 20, `${empty} empty, ${outline} outline pixels`)
      }
    }
  }

  // Tuning the chase camera must not start to dissolve the craft; that is for the cockpit. A
  // dissolving stack leaves out the pixels with the highest dither thresholds first, so a
  // solid one is the only kind that has outline pixels on them.
  {
    const shares = []
    for (const chaseDistance of [50, 130, 400]) {
      const game = createGame({ seed: 7, view: 'chase', tuning: { chaseDistance } })
      game.resize(384, 240)
      const frame = fly(game, 90)
      let outline = 0
      let onHigh = 0
      for (let i = 0; i < frame.color.length; i++) {
        if (frame.color[i] !== game.model.outline) continue
        outline++
        const x = i % frame.width
        const y = (i / frame.width) | 0
        if (BAYER4[((y & 3) << 2) | (x & 3)] >= 12) onHigh++
      }
      shares.push(outline > 100 ? onHigh / outline : 0)
    }
    check('draw: the craft is solid in the chase view, with the eye near or far', Math.min(...shares) > 0.15, `${shares.map((s) => Math.round(s * 100) + '%').join(', ')} of the outline is on the pixels a dissolve drops first, at 50, 130 and 400 px`)
  }

  // A window can be dragged down to almost nothing. The game must keep drawing, not throw.
  {
    let empty = 0
    let threw = ''
    try {
      for (const [width, height] of [[8, 8], [16, 300], [600, 20]]) {
        for (const view of VIEWS) {
          const game = createGame({ seed: 7, view })
          game.resize(width, height)
          game.setKeys(1, 0, false)
          empty += emptyPixels(fly(game, 20))
        }
      }
    } catch (error) {
      threw = String(error)
    }
    check('draw: every view still draws in a frame that is tiny, very tall or very wide', !threw && empty === 0, threw || `${empty} empty`)
  }

  // ── a view change never shows a broken frame: once round every view the game has
  if (VIEWS.length > 1) {
    const game = createGame({ seed: 7 })
    game.resize(384, 240)
    game.setKeys(0.6, 0, false) // a steady turn, so the cockpit leg is drawn banked
    fly(game, 30)
    let worst = 0
    let backwards = 0
    const arrived = []
    for (const leg of [...VIEWS.slice(1), VIEWS[0]]) {
      game.nextView()
      let chase = game.chaseAmount
      let cockpit = game.cockpitAmount ?? 0
      for (let i = 0; i < 240; i++) {
        game.update(1 / 60)
        const chaseWrong = leg === 'chase' ? game.chaseAmount < chase - 1e-9 : game.chaseAmount > chase + 1e-9
        const cockpitNow = game.cockpitAmount ?? 0 // a game with no cockpit need not have this
        const cockpitWrong = leg === 'cockpit' ? cockpitNow < cockpit - 1e-9 : cockpitNow > cockpit + 1e-9
        if (chaseWrong || cockpitWrong) backwards++
        chase = game.chaseAmount
        cockpit = cockpitNow
        const empty = emptyPixels(game.render())
        if (empty > worst) worst = empty
      }
      arrived.push(game.view === leg && chase === (leg === 'chase' ? 1 : 0) && cockpit === (leg === 'cockpit' ? 1 : 0))
    }
    check(`view change: the camera slides one way through all ${VIEWS.length} views and arrives each time`, backwards === 0 && arrived.every(Boolean), `${backwards} backward steps, arrived ${arrived.join(' ')}`)
    check('view change: every frame on the way is complete', worst === 0, `${worst} empty pixels at worst, over ${VIEWS.length * 240} frames`)
  }

  // ── the cockpit, in games that have one
  if (VIEWS.includes('cockpit')) {
    const game = createGame({ seed: 7, view: 'cockpit' })
    game.resize(384, 240)
    game.setKeys(1, 0.4, true)
    let gap = 0
    for (let i = 0; i < 180; i++) {
      game.update(1 / 60)
      const eye = eyeOf(game.camera)
      gap = Math.max(gap, Math.hypot(eye.x - game.craft.x, eye.y - game.craft.y, eye.z - game.craft.z - TUNING.cockpitEye))
    }
    check('cockpit: the eye stays in the craft while it turns, climbs and speeds up', gap < 0.01, `${gap.toFixed(4)} px away at worst`)
    check('cockpit: the picture banks with the craft', Math.abs(game.viewRoll - game.craft.roll * TUNING.cockpitRoll) < 1e-9 && game.viewRoll > 0.5, `banked ${game.viewRoll.toFixed(2)} rad in a hard right turn`)

    game.setKeys(0, 0, false)
    fly(game, 240)
    game.roll()
    let most = 0
    for (let i = 0; i < 120; i++) {
      game.update(1 / 60)
      most = Math.max(most, Math.abs(game.viewRoll))
    }
    check('cockpit: a barrel roll turns the picture all the way round and leaves it level', most > 6 && Math.abs(game.viewRoll) < 0.2, `turned ${most.toFixed(2)} rad, ends at ${game.viewRoll.toFixed(2)}`)
  }

  // ── rolling the picture, in games that still have roll.js
  if (existsSync(join(gameDir, 'src/roll.js'))) {
    const { createSheet, sizeSheet, fitSheet, pasteRolled } = await load('roll.js')
    const frame = createFramebuffer()
    const sheet = createSheet()
    frame.resize(120, 80)
    sizeSheet(sheet, 120, 80)
    const cx = 60
    const cy = 30
    const pattern = (x, y) => ((x * 31 + y * 17) | 0) >>> 0

    fitSheet(sheet, 120, 80, cx, cy, 0)
    for (let y = 0; y < sheet.height; y++) for (let x = 0; x < sheet.width; x++) sheet.color[y * sheet.width + x] = pattern(x - sheet.cx, y - sheet.cy)
    pasteRolled(frame, sheet, cx, cy, 0)
    let wrong = 0
    for (let y = 0; y < 80; y++) for (let x = 0; x < 120; x++) if (frame.color[y * 120 + x] !== pattern(x - cx, y - cy)) wrong++
    check('roll: a sheet turned by nothing comes back unchanged', wrong === 0, `${wrong} pixels differ`)

    let uncovered = 0
    let overflow = 0
    for (let angle = -3.2; angle <= 3.2; angle += 0.05) {
      fitSheet(sheet, 120, 80, cx, cy, angle)
      if (sheet.width * sheet.height > sheet.color.length) overflow++
      sheet.color.fill(7)
      frame.color.fill(0)
      pasteRolled(frame, sheet, cx, cy, angle)
      for (let i = 0; i < frame.color.length; i++) if (frame.color[i] !== 7) uncovered++
    }
    check('roll: the sheet covers the whole frame at every angle, inside the memory it was given', uncovered === 0 && overflow === 0, `${uncovered} uncovered pixels, ${overflow} overflows`)

    // sky above the pivot, ground below it; then bank right and see which end of the horizon rose
    fitSheet(sheet, 120, 80, cx, cy, 0.4)
    for (let y = 0; y < sheet.height; y++) sheet.color.fill(y < sheet.cy ? 1 : 2, y * sheet.width, (y + 1) * sheet.width)
    pasteRolled(frame, sheet, cx, cy, 0.4)
    const horizonAt = (x) => {
      let y = 0
      while (y < 80 && frame.color[y * 120 + x] === 1) y++
      return y
    }
    check('roll: a bank to the right lifts the right-hand end of the horizon', horizonAt(100) < horizonAt(20) && horizonAt(60) === cy, `rows ${horizonAt(20)}, ${horizonAt(60)}, ${horizonAt(100)} from left to right`)
  }

  // ── the same seed and input give the same picture
  {
    const run = () => {
      const game = createGame({ seed: 11 })
      game.resize(320, 200)
      game.setKeys(1, 0, true)
      const frame = fly(game, 260, (i) => {
        if (i === 60 || i === 150) game.nextView()
        if (i === 100 || i === 200) game.roll()
      })
      return checksum(frame.color)
    }
    const a = run()
    check('replay: the same seed and input draw the same frame', a === run(), `frame ${a.toString(16)}`)
  }

  // ── input
  {
    const game = createGame({ seed: 7 })
    game.resize(384, 240)
    const start = game.craft.yaw
    game.setKeys(1, 0, false)
    fly(game, 60)
    check('input: holding right turns the craft clockwise', game.craft.yaw > start + 0.1, `turned ${(game.craft.yaw - start).toFixed(2)} rad in a second`)
    game.setKeys(0, 0, false)
    game.press()
    game.release()
    check('input: a click starts a roll', game.craft.spin === 0)
    game.press()
    fly(game, 45)
    check('input: a hold opens the thrusters', game.boost > 0.6, `boost ${game.boost.toFixed(2)}`)
    game.release()
    let lowest = Infinity
    game.setKeys(0, -1, false)
    for (let i = 0; i < 900; i++) {
      game.update(1 / 60)
      const clear = game.craft.z - groundAt(game.world, game.craft.x, game.craft.y)
      if (clear < lowest) lowest = clear
    }
    check('flight: holding a dive for 15 seconds never reaches the ground', lowest > 3, `closest ${lowest.toFixed(1)} px`)
  }
  for (const view of ['chase', 'cockpit'].filter((name) => VIEWS.includes(name))) {
    const game = createGame({ seed: 7, view })
    game.resize(384, 240)
    fly(game, 30)
    const yaw = game.craft.yaw
    const z = game.craft.z
    for (let i = 0; i < 90; i++) {
      game.pointerMove(384 * 0.85, 240 * 0.08) // up and to the right
      game.update(1 / 60)
    }
    check(`input: in the ${view} view, pointing up and to the right climbs and turns clockwise`, game.craft.yaw > yaw + 0.1 && game.craft.z > z + 2, `turned ${(game.craft.yaw - yaw).toFixed(2)} rad, climbed ${(game.craft.z - z).toFixed(0)} px`)
  }

  // ── speed
  for (const view of VIEWS) {
    const game = createGame({ seed: 7, view })
    game.resize(480, 270)
    game.setKeys(1, 0, false) // a turn, so the cockpit pays for rolling the picture
    fly(game, 30)
    const frames = 240
    const began = performance.now()
    for (let i = 0; i < frames; i++) {
      game.update(1 / 60)
      game.render()
    }
    const each = (performance.now() - began) / frames
    check(`speed: a ${view} frame at 480×270 fits in a 60 fps frame`, each < 16.6, `${each.toFixed(2)} ms per frame`)
  }

  // ── the game stays self-contained
  {
    const sources = ['index.html', ...readdirSync(join(gameDir, 'src')).map((f) => `src/${f}`)]
    let raw = 0
    let packed = 0
    const outside = []
    for (const file of sources) {
      const text = readFileSync(join(gameDir, file), 'utf8')
      raw += text.length
      packed += gzipSync(text).length
      if (/https?:\/\//.test(text)) outside.push(`${file}: a web address`)
      for (const m of text.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) if (!m[1].startsWith('./')) outside.push(`${file}: imports ${m[1]}`)
      if (/getContext\(\s*['"](webgl2?|webgpu)|WebGLRenderingContext|navigator\.gpu/.test(text)) outside.push(`${file}: uses WebGL or WebGPU`)
      if (/Math\.random\(/.test(text)) outside.push(`${file}: uses Math.random()`)
    }
    check('game: no libraries, no network, no 3D engine, no unseeded randomness', outside.length === 0, outside.join('; ') || `${sources.length} files, ${(raw / 1024).toFixed(1)} KB, ${(packed / 1024).toFixed(1)} KB gzipped`)
  }

  // ── every state the game's own map can reach (see states.js beside the game)
  if (existsSync(join(gameDir, 'states.js'))) {
    const walk = await runStates({ game: folder })
    const first = [...walk.broken][0]
    check(
      'states: the game keeps its rules in every state it can reach',
      walk.complete && walk.broken.size === 0,
      first ? `"${first[0]}" breaks after: ${first[1].path.join(', ')}. Run bun run states for the rest` : `${walk.seen.size} states, ${walk.map.rules.length} rules, ${walk.tried} paths${walk.complete ? '' : ', and the walk did not finish'}`,
    )
  }

  // ── the tools
  {
    // With no --port, the server once ignored its folder and served the starter instead.
    const run = spawnSync(process.execPath, [join(root, 'scripts/serve.mjs'), 'no/such/folder'], { encoding: 'utf8', timeout: 5000 })
    const refused = run.status === 1 && run.stderr.includes('Nothing to serve')
    check('tools: the server serves the folder it is given, and refuses a missing one', refused, run.status === null ? 'it started serving something else' : `exit ${run.status}`)
    // `bun start --game x` once served the starter, because --game was ignored.
    const byGame = spawnSync(process.execPath, [join(root, 'scripts/serve.mjs'), 'examples/starter', '--game', 'no/such/folder'], { encoding: 'utf8', timeout: 5000 })
    const obeyed = byGame.status === 1 && byGame.stderr.includes('Nothing to serve')
    check('tools: the server serves the game named by --game', obeyed, byGame.status === null ? 'it started serving something else' : `exit ${byGame.status}`)
  }

  return results
}

// Run directly (not imported by tests/kit.test.js): print every result and set the exit code.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const at = process.argv.indexOf('--game')
  const results = await runChecks({ game: at < 0 ? undefined : process.argv[at + 1] })
  for (const { name, ok, detail } of results) console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`)
  const failed = results.filter((r) => !r.ok).length
  console.log(failed ? `\n${failed} of ${results.length} checks failed` : `\nall ${results.length} checks passed`)
  process.exit(failed ? 1 : 0)
}
