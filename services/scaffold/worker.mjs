import { database } from './db.mjs'
const pool = database(2)
let stopped = false
async function tick() {
  if (stopped) return
  try {
    await pool.query("INSERT INTO runtime_probe(name, updated_at) VALUES ('worker', now()) ON CONFLICT(name) DO UPDATE SET updated_at = excluded.updated_at")
  } catch { console.error('worker_database_unavailable') }
  if (!stopped) timer = setTimeout(tick, 15000)
}
let timer
console.log('scaffold_worker_started_no_chain_operations')
tick()
process.on('SIGTERM', async () => { stopped = true; clearTimeout(timer); await pool.end(); process.exit(0) })
