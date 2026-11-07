import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from './withTimeout';

afterEach(() => vi.useRealTimers());

describe('bounded account loading', () => {
  it('returns successful data and clears the timeout', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.resolve('profile'), 15000)).resolves.toBe('profile');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('propagates request failures and clears the timeout', async () => {
    vi.useFakeTimers();
    await expect(withTimeout(Promise.reject(new Error('Offline')), 15000)).rejects.toThrow('Offline');
    expect(vi.getTimerCount()).toBe(0);
  });
  it('exits loading when the request never settles', async () => {
    vi.useFakeTimers();
    const result = withTimeout(new Promise<never>(() => {}), 15000);
    const assertion = expect(result).rejects.toThrow('Request timed out');
    await vi.advanceTimersByTimeAsync(15000);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });
});
