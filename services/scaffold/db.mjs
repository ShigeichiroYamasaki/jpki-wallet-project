import { readFileSync } from 'node:fs'
import pg from 'pg'

export function database(max = 2) {
  const pool = new pg.Pool({
    host: process.env.PGHOST || 'db',
    database: 'jw_scaffold',
    user: 'jw_scaffold',
    password: readFileSync('/run/secrets/db_password', 'utf8').trim(),
    max, connectionTimeoutMillis: 1500, idleTimeoutMillis: 10000,
    query_timeout: 2000, statement_timeout: 2000
  })
  pool.on('error', () => console.error('database_connection_unavailable'))
  return pool
}
