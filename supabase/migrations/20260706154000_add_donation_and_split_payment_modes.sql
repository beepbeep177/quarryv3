-- Add DONATION and SPLIT as valid payment modes and store split payment breakdowns.
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_mode_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_mode_check
  CHECK (payment_mode IN ('CASH', 'P.O', 'OFFSET', 'GCASH', 'BANK_TRANSFER', 'DONATION', 'SPLIT'));

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS split_payment_details jsonb;

UPDATE transactions
SET split_payment_details = '[]'::jsonb
WHERE split_payment_details IS NULL;

ALTER TABLE transactions
  ALTER COLUMN split_payment_details SET DEFAULT '[]'::jsonb;

ALTER TABLE transactions
  ALTER COLUMN split_payment_details SET NOT NULL;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_split_payment_details_array_check
  CHECK (jsonb_typeof(split_payment_details) = 'array');
