import { describe, expect, it } from 'vitest'

describe('Sample test suite', () => {
    it('test 1 - annotation only', async ({ annotate }) => {
        await annotate('[1111]')
        expect(1 + 1).toBe(2)
    })

    it('[2222] test 2 - name only', () => {
        expect(2 + 2).toBe(4)
    })

    it('[33333] test 3 - both methods', async ({ annotate }) => {
        await annotate('[33333,44444,55555]')
        // This test will be reported for IDs: 33333, 44444, 55555
        expect(3 + 3).toBe(6)
    })

    it('test 4 - no IDs (will be skipped)', () => {
        expect(4 + 4).toBe(8)
    })
})
