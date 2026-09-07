import { test } from 'node:test'
import assert from 'node:assert/strict'
import { verifyMockJpki } from './mock-jpki.mjs'
const input = { scenario: 'valid', person: 'person-a', intentHash: 'a'.repeat(64) }
test('mock result is marked as simulation and stable identity survives renewal', () => {
  const original = verifyMockJpki(input)
  const renewed = verifyMockJpki({ ...input, scenario: 'renewed' })
  assert.equal(original.isMock, true)
  assert.equal(original.assurance, 'simulation-only')
  assert.equal(original.mockSubjectId, renewed.mockSubjectId)
  assert.notEqual(original.certificateFixture, renewed.certificateFixture)
  assert.notEqual(original.mockSubjectId, verifyMockJpki({ ...input, person: 'person-b' }).mockSubjectId)
})
test('certificate failures never produce verified results', () => {
  for (const scenario of ['revoked', 'expired', 'invalid_signature']) {
    const result = verifyMockJpki({ ...input, scenario })
    assert.equal(result.outcome, 'rejected')
    assert.equal(result.mockSubjectId, undefined)
  }
})
test('PF uncertainty is distinguished from verification failure', () => {
  assert.equal(verifyMockJpki({ ...input, scenario: 'timeout' }).outcome, 'indeterminate')
  assert.equal(verifyMockJpki({ ...input, scenario: 'unavailable' }).outcome, 'unavailable')
})
test('real certificate and unexpected fields are not accepted', () => {
  for (const extra of [{ certificate: 'fake-test' }, { signature: 'fake-test' }, { name: 'test' }, { provider: 'pocketsign' }]) {
    assert.throws(() => verifyMockJpki({ ...input, ...extra }), /INVALID_MOCK_INPUT/)
  }
  assert.throws(() => verifyMockJpki({ ...input, intentHash: 'wrong' }), /INVALID_MOCK_INPUT/)
  assert.throws(() => verifyMockJpki({ ...input, person: 'arbitrary' }), /INVALID_MOCK_INPUT/)
})
