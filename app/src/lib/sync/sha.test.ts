import { describe, expect, it } from 'vitest'
import { gitBlobSha } from './sha'

// Expected values come from `git hash-object`.
describe('gitBlobSha', () => {
  it('matches git', async () => {
    expect(await gitBlobSha('')).toBe('e69de29bb2d1d6434b8b29ae775ad8c2e48c5391')
    expect(await gitBlobSha('hello\n')).toBe('ce013625030ba8dba906f756967f9e9ca394464a')
    expect(await gitBlobSha('héllo 🎉\n')).toBe('441d05734550bc72f74c511defae3c4da9f8a101')
    expect(await gitBlobSha('## Tasks work\n\n- [x] Read this note\n- [ ] Set up sync\n')).toBe('e57a951a1a5b7bfae01ec003b738b1939469d44b')
  })
})
