import { database } from './db.mjs'
const pool = database(1)
try {
  const result = await pool.query("SELECT updated_at > now() - interval '90 seconds' AS fresh FROM runtime_probe WHERE name = 'worker'")
  process.exitCode = result.rows[0]?.fresh ? 0 : 1
} catch { process.exitCode = 1 }
finally { await pool.end() }
