import { describe, it, expect } from 'vitest';

describe('Tests without annotations', () => {
    it('should pass but not be reported to Azure DevOps', () => {
        expect(2 + 2).toBe(4);
    });

    it('should also pass but not be reported', () => {
        expect('hello').toBe('hello');
    });
});
