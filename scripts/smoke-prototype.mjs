import assert from 'node:assert/strict'
const base = process.env.PROTOTYPE_URL || 'http://127.0.0.1:18080'
const ready = await fetch(`${base}/readyz`)
assert.equal(ready.status, 200)
assert.equal((await ready.json()).protocolImplemented, false)
const expected = { valid: 200, renewed: 200, revoked: 422, expired: 422, invalid_signature: 422, timeout: 504, unavailable: 503 }
for (const [scenario, status] of Object.entries(expected)) {
  const response = await fetch(`${base}/api/mock/jpki/verify`, { method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ scenario, person: 'person-a', intentHash: 'a'.repeat(64) }) })
  assert.equal(response.status, status, scenario)
  const result = await response.json()
  assert.equal(result.provider, 'mock')
  assert.equal(result.isMock, true)
  assert.equal(result.assurance, 'simulation-only')
}
const forbidden = await fetch(`${base}/api/mock/jpki/verify`, { method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ scenario: 'valid', person: 'person-a', intentHash: 'a'.repeat(64), certificate: 'synthetic-rejection-test' }) })
assert.equal(forbidden.status, 400)
assert.equal((await fetch(`${base}/api/v1/binding-sessions`, { method: 'POST' })).status, 501)
console.log('PASS: DB/worker readiness, 7 mock outcomes, certificate input rejection, unimplemented protocol rejection.')
