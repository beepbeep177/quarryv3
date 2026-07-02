/*
  # Round CBM to 2 decimal places in all calculations

  Previously:
  - volume_m3 was stored with 4 decimal places
  - amount and total_amount were calculated using the raw (unrounded) volume

  Now:
  - volume_m3 is rounded to 2 decimal places (matching the displayed/receipt value)
  - amount = ROUND(rounded_volume * unit_price, 2)
  - total_amount = amount + extras
  
  This ensures the backend calculation matches what is shown on receipts:
  e.g. 10.54 × 250 = 2,635.00 instead of 10.5431 × 250 = 2,635.78
*/

-- Drop computed columns first (PostgreSQL does not allow ALTER on generated columns directly)
ALTER TABLE transactions
  DROP COLUMN IF EXISTS total_amount,
  DROP COLUMN IF EXISTS amount,
  DROP COLUMN IF EXISTS volume_m3;

-- Re-add with corrected expressions: volume rounded to 2dp, amount uses rounded volume
ALTER TABLE transactions
  ADD COLUMN volume_m3 numeric GENERATED ALWAYS AS (
    ROUND((length_cm * width_cm * height_cm) / 1000000.0, 2)
  ) STORED,
  ADD COLUMN amount numeric GENERATED ALWAYS AS (
    ROUND(ROUND((length_cm * width_cm * height_cm) / 1000000.0, 2) * unit_price, 2)
  ) STORED,
  ADD COLUMN total_amount numeric GENERATED ALWAYS AS (
    ROUND(ROUND((length_cm * width_cm * height_cm) / 1000000.0, 2) * unit_price, 2) + dr_capitol + passway + kulot
  ) STORED;
