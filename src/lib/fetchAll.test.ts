import { describe, expect, it, vi } from 'vitest';
import { fetchAllPages } from './fetchAll';

describe('fetchAllPages', () => {
  it('continues until a short page is returned', async () => {
    const fetchPage = vi.fn(async (from: number, to: number) => ({
      data: from === 0 ? [1, 2] : [3],
      error: null,
      range: [from, to],
    }));

    const result = await fetchAllPages(fetchPage, 2);
    expect(result).toEqual({ data: [1, 2, 3], error: null });
    expect(fetchPage).toHaveBeenNthCalledWith(1, 0, 1);
    expect(fetchPage).toHaveBeenNthCalledWith(2, 2, 3);
  });

  it('returns rows already loaded when a later page fails', async () => {
    const result = await fetchAllPages(async (from) => from === 0
      ? { data: ['a', 'b'], error: null }
      : { data: null, error: { message: 'network failed' } }, 2);

    expect(result.data).toEqual(['a', 'b']);
    expect(result.error?.message).toBe('network failed');
  });
});
