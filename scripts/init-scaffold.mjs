import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync, chmodSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
const directory = fileURLToPath(new URL('../.secrets/', import.meta.url))
const path = `${directory}/db_password`
mkdirSync(directory, { recursive: true, mode: 0o700 })
chmodSync(directory, 0o700)
if (!existsSync(path)) {
  // Readable inside each explicit file mount; parent directory stays owner-only.
  writeFileSync(path, randomBytes(32).toString('hex'), { flag: 'wx', mode: 0o444 })
}
console.log('P0 test DB secret prepared; existing values were not overwritten.')
