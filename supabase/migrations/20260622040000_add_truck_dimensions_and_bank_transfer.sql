-- Mission 1: Add length_cm, width_cm, height_cm to trucks table
-- These replace the single capacity_m3 input so trucks store their bed dimensions
-- and capacity_m3 continues to be set from L*W*H by the application

ALTER TABLE trucks
  ADD COLUMN IF NOT EXISTS length_cm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS width_cm numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS height_cm numeric NOT NULL DEFAULT 0;

-- Mission 3: Add BANK_TRANSFER as a valid payment mode
ALTER TABLE transactions
  DROP CONSTRAINT IF EXISTS transactions_payment_mode_check;

ALTER TABLE transactions
  ADD CONSTRAINT transactions_payment_mode_check
  CHECK (payment_mode IN ('CASH', 'P.O', 'OFFSET', 'GCASH', 'BANK_TRANSFER'));
