import { describe, expect, it } from 'vitest'

describe('[1234] Sample test suite', () => {
    it('[5678] should pass', async ({ annotate }) => {
        await annotate('[5678]')
        expect(1 + 1).toBe(2)
    })

    it('[1234] should pass', async ({ annotate }) => {
        await annotate('[1234]')
        expect(1 + 1).toBe(2)
    })
})
