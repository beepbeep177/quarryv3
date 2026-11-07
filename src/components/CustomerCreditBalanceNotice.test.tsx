import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import CustomerCreditBalanceNotice from './CustomerCreditBalanceNotice';

describe('customer credit advisory', () => {
  it('shows the projected negative balance and explicitly allows saving', () => {
    const html = renderToStaticMarkup(<CustomerCreditBalanceNotice customerName="Dazon" balance={3074.10} paymentAmount={16701.30} loading={false} error={null} />);
    expect(html).toContain('PHP -13,627.20');
    expect(html).toContain('This entry can still be saved.');
    expect(html).toContain('customer owes');
  });
  it('does not present a failed balance fetch as a real zero balance', () => {
    const html = renderToStaticMarkup(<CustomerCreditBalanceNotice customerName="Dazon" balance={0} paymentAmount={500} loading={false} error="Connection lost" />);
    expect(html).toContain('Unavailable');
    expect(html).toContain('Connection lost');
    expect(html).not.toContain('Balance after this entry');
  });
  it('does not project from stale data while a new balance loads', () => {
    const html = renderToStaticMarkup(<CustomerCreditBalanceNotice customerName="Dazon" balance={500} paymentAmount={1000} loading error={null} />);
    expect(html).toContain('Loading...');
    expect(html).not.toContain('Balance after this entry');
  });
});
