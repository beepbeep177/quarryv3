-- Add GCASH as a valid payment mode by dropping and recreating the CHECK constraint

ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_mode_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_mode_check
  CHECK (payment_mode IN ('CASH', 'P.O', 'OFFSET', 'GCASH'));
