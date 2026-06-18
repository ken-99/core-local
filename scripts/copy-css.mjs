// With tsup `bundle: false`, esbuild transpiles each .ts/.tsx file but leaves
// asset imports alone — it doesn't copy them. Two kinds matter here:
//   - `import './foo.css'`  → Next resolves it at consume-time and fails if
//     dist/<path>/foo.css doesn't exist.
//   - `import m from './manifest.json'` (the plugins' manifests) → same thing:
//     installed.js keeps the relative import, so dist needs the .json beside it
//     or the app fails with "Can't resolve ./air-traffic/manifest.json".
// This step mirrors every .css and .json under src/ into dist/ at the same
// relative path so those imports resolve.
import { readdirSync, mkdirSync, copyFileSync } from 'node:fs'
import path from 'node:path'

const SRC = 'src'
const DEST = 'dist'

let copied = 0
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const srcPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(srcPath)
    } else if (entry.name.endsWith('.css') || entry.name.endsWith('.json')) {
      const destPath = path.join(DEST, path.relative(SRC, srcPath))
      mkdirSync(path.dirname(destPath), { recursive: true })
      copyFileSync(srcPath, destPath)
      copied++
    }
  }
}

walk(SRC)
console.log(`assets: copied ${copied} .css/.json file(s) from ${SRC}/ to ${DEST}/`)