import { describe, expect, it } from 'vitest';
import { friendlyDbError, isNetworkError, loadErrorMessage, NOT_SAVED_MESSAGE } from './dbErrors';

describe('friendlyDbError', () => {
  it('explains network failures', () => {
    const error = { message: 'TypeError: Failed to fetch' };
    expect(isNetworkError(error)).toBe(true);
    expect(friendlyDbError(error)).toMatch(/Nothing was saved/);
  });

  it('maps common Postgres codes', () => {
    expect(friendlyDbError({ code: '23503', message: 'fk' })).toMatch(/still used by other records/);
    expect(friendlyDbError({ code: '23505', message: 'dup' })).toMatch(/already exists/);
    expect(friendlyDbError({ code: '42501', message: 'rls' })).toMatch(/permission/);
  });

  it('falls back to the raw message or the not-saved message', () => {
    expect(friendlyDbError({ message: 'Custom rule failed' })).toBe('Custom rule failed');
    expect(friendlyDbError(null)).toBe(NOT_SAVED_MESSAGE);
  });

  it('builds load messages', () => {
    expect(loadErrorMessage('customers', { message: 'Failed to fetch' })).toMatch(/no internet/);
    expect(loadErrorMessage('customers', { message: 'boom' })).toBe('Could not load customers. The list may be incomplete. boom');
  });
});
