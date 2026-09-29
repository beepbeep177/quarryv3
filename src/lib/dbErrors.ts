interface DbErrorLike {
  message?: string;
  code?: string;
}

/** Shown when the database silently changed 0 rows (usually a permission rule or a stale record). */
export const NOT_SAVED_MESSAGE =
  'The change was not saved. You may not have permission for this action, or the record was changed or removed by someone else. Refresh and try again.';

export function isNetworkError(error: DbErrorLike | null | undefined): boolean {
  return /failed to fetch|networkerror|network request failed|load failed|fetch failed/i.test(error?.message ?? '');
}

/** Turns Supabase/Postgres errors into messages encoders can act on. */
export function friendlyDbError(error: DbErrorLike | null | undefined, fallback = NOT_SAVED_MESSAGE): string {
  if (!error) return fallback;
  if (isNetworkError(error)) {
    return 'No internet connection or the server could not be reached. Nothing was saved. Check the connection and try again.';
  }
  if (error.code === '23503') {
    return 'This record is still used by other records (for example transactions, trucks, settlements or ledger entries), so it cannot be deleted or changed.';
  }
  if (error.code === '23505') return 'A record with the same details already exists.';
  if (error.code === '42501') return 'You do not have permission for this action.';
  return error.message || fallback;
}

/** Message for a failed load, e.g. loadErrorMessage('customers', error). */
export function loadErrorMessage(what: string, error: DbErrorLike | null | undefined): string {
  if (isNetworkError(error)) {
    return `Could not load ${what}: no internet connection or the server could not be reached. The list may be incomplete or outdated.`;
  }
  return `Could not load ${what}. The list may be incomplete. ${error?.message ?? ''}`.trim();
}
