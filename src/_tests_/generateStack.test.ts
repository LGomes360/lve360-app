import { generateStack } from '../../lib/generateStack';

// Mock the Supabase client to avoid network calls. We stub out only the methods
// used by generateStack.
jest.mock('@supabase/supabase-js', () => {
  const mockFrom = jest.fn().mockReturnThis();
  const mockSelect = jest.fn().mockReturnThis();
  const mockEq = jest.fn().mockReturnThis();
  const mockIn = jest.fn().mockReturnThis();
  const mockSingle = jest.fn();
  return {
    createClient: () => ({
      from: () => ({
        select: mockSelect,
        eq: mockEq,
        in: mockIn,
        single: mockSingle,
      }),
    }),
  };
});

describe('generateStack', () => {
  it('returns empty stack when no matching rules', async () => {
    // Arrange: configure mocks to return empty rules
    const { createClient } = require('@supabase/supabase-js');
    const client = createClient();
    client.from().select.mockImplementationOnce(() => ({ data: [], error: null }));
    // Act
    const result = await generateStack({ goals: ['unknown-goal'] });
    // Assert
    expect(result).toEqual([]);
  });
});