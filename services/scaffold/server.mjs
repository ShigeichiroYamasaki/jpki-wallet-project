import { createServer } from 'node:http'
import { database } from './db.mjs'
import { verifyMockJpki } from './mock-jpki.mjs'

if ((process.env.JPKI_PROVIDER || 'mock') !== 'mock') throw new Error('ONLY_MOCK_PROVIDER_SUPPORTED')

const pool = database(4)
const server = createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  const send = (status, data) => { res.writeHead(status); res.end(JSON.stringify(data)) }
  // Explicit mock route only; real certificate fields are rejected by an allowlist.
  const path = (req.url || '/').split('?')[0]
  if (path === '/api/mock/jpki/verify' && req.method === 'POST') {
    if (!(req.headers['content-type'] || '').startsWith('application/json')) { send(415, { code: 'JSON_REQUIRED' }); req.resume(); return }
    let body = ''
    try {
      for await (const chunk of req) {
        body += chunk.toString('utf8')
        if (Buffer.byteLength(body) > 2048) { send(413, { code: 'MOCK_INPUT_TOO_LARGE' }); req.resume(); return }
      }
      const result = verifyMockJpki(JSON.parse(body))
      const status = { verified: 200, rejected: 422, indeterminate: 504, unavailable: 503 }[result.outcome]
      send(status, result)
    } catch { if (!res.headersSent) send(400, { code: 'INVALID_MOCK_INPUT' }) }
    return
  }
  if (path.startsWith('/api/')) {
    send(501, { code: 'PROTOCOL_NOT_IMPLEMENTED', phase: 'P0' })
    req.resume()
    return
  }
  if (req.method !== 'GET') { send(405, { code: 'METHOD_NOT_ALLOWED' }); req.resume(); return }
  if (path === '/healthz') { send(200, { status: 'alive', phase: 'P0' }); return }
  if (path === '/readyz') {
    try {
      const result = await pool.query("SELECT updated_at > now() - interval '90 seconds' AS fresh FROM runtime_probe WHERE name = 'worker'")
      if (!result.rows[0]?.fresh) { send(503, { status: 'not_ready' }); return }
      send(200, { status: 'ready', phase: 'P0', protocolImplemented: false })
    } catch { send(503, { status: 'not_ready' }) }
    return
  }
  if (path === '/') {
    send(200, { service: 'JPKI Wallet infrastructure scaffold', phase: 'P0', protocolImplemented: false,
      message: '基盤確認用です。JPKI・パスキー・SIWE検証は未実装です。実際の本人情報を送信しないでください。' })
    return
  }
  send(404, { code: 'NOT_FOUND' })
})
server.requestTimeout = 10000
server.headersTimeout = 10000
server.keepAliveTimeout = 5000
server.listen(3000, '0.0.0.0', () => console.log('scaffold_api_started'))
process.on('SIGTERM', () => {
  server.close(() => pool.end().then(() => process.exit(0)))
  setTimeout(() => process.exit(1), 5000).unref()
})
