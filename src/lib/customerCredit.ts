/** Deduct in cents so the projected ledger balance keeps its signed value. */
export function customerCreditBalanceAfter(balance: number, paymentAmount: number): number {
  return (Math.round(balance * 100) - Math.round(paymentAmount * 100)) / 100;
}
