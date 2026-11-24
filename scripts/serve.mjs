#!/usr/bin/env bun
// A tiny static file server with no dependencies, for running the starter (or the downloaded
// reference) locally. ES modules do not load from file://, so a game needs to be served.
//
//   bun start                                          # the starter, at http://localhost:5173
//   bun start --game examples/my-game                  # another game, like the other commands
//   bun scripts/serve.mjs examples/my-game             # the same
//   bun scripts/serve.mjs reference/creativedash-fighter --port 5180
//
// It listens on this computer only (127.0.0.1).

import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, extname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const portAt = args.indexOf('--port')
const gameAt = args.indexOf('--game')
const firstPort = portAt >= 0 ? Number(args[portAt + 1]) : 5173
// --game wins over a bare folder name, so `bun start --game examples/x` serves x
const dirArg =
  (gameAt >= 0 ? args[gameAt + 1] : undefined) ??
  args.find((a, i) => !a.startsWith('--') && (portAt < 0 || i !== portAt + 1) && (gameAt < 0 || i !== gameAt + 1)) ??
  'examples/starter'
if (!Number.isInteger(firstPort) || firstPort < 1 || firstPort > 65535) {
  console.error('--port needs a number from 1 to 65535.')
  process.exit(1)
}
const base = resolve(root, dirArg)

if (!existsSync(base)) {
  console.error(`Nothing to serve: ${base} does not exist.`)
  if (dirArg.startsWith('reference')) console.error('Run `bun run fetch-reference` first.')
  process.exit(1)
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  // Forge serves compiled modules under their original .ts and .tsx names
  '.ts': 'text/javascript; charset=utf-8',
  '.tsx': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.md': 'text/plain; charset=utf-8',
}

const server = createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost')
  let path
  try {
    path = decodeURIComponent(url.pathname)
  } catch {
    res.writeHead(400).end('Bad request')
    return
  }
  let file = resolve(join(base, path))
  if (file !== base && !file.startsWith(base + sep)) {
    res.writeHead(403).end('Forbidden')
    return
  }
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html')
  if (!existsSync(file)) {
    res.writeHead(404, { 'content-type': 'text/plain' }).end(`Not found: ${path}`)
    return
  }
  const headers = { 'cache-control': 'no-store' }
  // Forge imports an asset as `sound.mp3?v=…&module`: a module whose default export is the
  // asset's address. Answer those the same way, so the reference runs unchanged.
  if (url.searchParams.has('module')) {
    url.searchParams.delete('module')
    const address = `.${path.slice(path.lastIndexOf('/'))}${url.search}`
    res.writeHead(200, { ...headers, 'content-type': TYPES['.js'] })
    res.end(`export default new URL(${JSON.stringify(address)}, import.meta.url).href;\n`)
    return
  }
  res.writeHead(200, { ...headers, 'content-type': TYPES[extname(file).toLowerCase()] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})

let port = firstPort
server.on('error', (error) => {
  if (error.code === 'EADDRINUSE' && port < firstPort + 20) {
    port++
    server.listen(port, '127.0.0.1')
  } else {
    console.error(error.message)
    process.exit(1)
  }
})
server.on('listening', () => {
  console.log(`Serving ${dirArg} at http://localhost:${port}`)
  console.log('Press Ctrl+C to stop.')
})
server.listen(port, '127.0.0.1')
