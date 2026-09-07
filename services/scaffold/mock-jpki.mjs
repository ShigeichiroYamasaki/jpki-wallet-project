import { createHash } from 'node:crypto'

const scenarios = new Set(['valid', 'renewed', 'revoked', 'expired', 'invalid_signature', 'timeout', 'unavailable'])
const persons = new Set(['person-a', 'person-b'])
export function verifyMockJpki(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('INVALID_MOCK_INPUT')
  const allowed = new Set(['scenario', 'person', 'intentHash'])
  if (Object.keys(input).some(key => !allowed.has(key)) || !scenarios.has(input.scenario)
      || !persons.has(input.person) || !/^[0-9a-f]{64}$/.test(input.intentHash)) throw new Error('INVALID_MOCK_INPUT')
  const base = { provider: 'mock', assurance: 'simulation-only', isMock: true, intentHash: input.intentHash }
  if (input.scenario === 'timeout') return { ...base, outcome: 'indeterminate', code: 'MOCK_PF_TIMEOUT' }
  if (input.scenario === 'unavailable') return { ...base, outcome: 'unavailable', code: 'MOCK_PF_UNAVAILABLE' }
  if (['revoked', 'expired', 'invalid_signature'].includes(input.scenario)) {
    return { ...base, outcome: 'rejected', code: `MOCK_${input.scenario.toUpperCase()}` }
  }
  // Fixture-based response only. No certificate parsing, signature verification or network calls.
  return { ...base, outcome: 'verified', code: 'MOCK_VERIFIED',
    mockSubjectId: `mock:${input.person}`,
    certificateFixture: input.scenario === 'renewed' ? 'synthetic-v2' : 'synthetic-v1',
    evidenceHash: createHash('sha256').update(`mock-v1:${input.person}:${input.intentHash}:${input.scenario}`).digest('hex') }
}
