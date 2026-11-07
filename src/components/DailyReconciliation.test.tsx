import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import DailyReconciliation from './DailyReconciliation';
import Sidebar from './Sidebar';

vi.mock('../lib/supabase', () => ({ supabase: {} }));

describe('reconciliation entry points', () => {
  it('shows a loading state, without claiming balances are matched before data arrives', () => {
    const html = renderToStaticMarkup(<DailyReconciliation />);
    expect(html).toContain('Checking records');
    expect(html).not.toContain('No discrepancies found');
    expect(html).not.toContain('Matched');
  });
  it('shows the reconciliation link to a permitted user', () => {
    const html = renderToStaticMarkup(<Sidebar activeSection="reconciliation" onNavigate={() => {}} can={code => code === 'RECONCILIATION_VIEW'} />);
    expect(html).toContain('href="#/reconciliation"');
  });
  it('hides the reconciliation link from a user without permission', () => {
    const html = renderToStaticMarkup(<Sidebar activeSection="daily-view" onNavigate={() => {}} can={code => code === 'DAILY_LEDGER_VIEW'} />);
    expect(html).not.toContain('href="#/reconciliation"');
  });
});
