import { supabase } from './supabase';
import type { OperationsModuleKey } from './operationsDashboard';
import { friendlyDbError, NOT_SAVED_MESSAGE } from './dbErrors';

export const NO_OPERATION_NOTE = 'No operation';

const LABELS: Record<OperationsModuleKey, string> = {
  stoneCrusher: 'Stone Crusher',
  sandWashing: 'Sand Washing',
  quarrySite: 'Quarry Site',
  wobbler: 'Wobbler',
};

export function operationsModuleLabel(module: OperationsModuleKey) {
  return LABELS[module];
}

function insertNoOperationEntry(module: OperationsModuleKey, entryDate: string) {
  const base = { entry_date: entryDate, notes: NO_OPERATION_NOTE };
  switch (module) {
    case 'stoneCrusher':
      return supabase.from('stone_crusher_daily_entries').insert(base).select('id');
    case 'sandWashing':
      return supabase.from('sand_washing_daily_entries').insert({ ...base, product: 'No Operation', waste_product: 'N/A' }).select('id');
    case 'quarrySite':
      return supabase.from('quarry_site_daily_entries').insert(base).select('id');
    case 'wobbler':
      return supabase.from('wobbler_daily_entries').insert(base).select('id');
  }
}

/**
 * Records a day with zero operation for a module: an entry with all counts at 0
 * (the table defaults) and a "No operation" note. Returns an error message or null.
 */
export async function markNoOperation(module: OperationsModuleKey, entryDate: string): Promise<string | null> {
  const { data, error } = await insertNoOperationEntry(module, entryDate);
  if (error) {
    return error.code === '23505'
      ? `There is already a ${LABELS[module]} entry for this date. Open that row to edit it instead.`
      : friendlyDbError(error);
  }
  return data && data.length > 0 ? null : NOT_SAVED_MESSAGE;
}
