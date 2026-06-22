-- Add material_type column to transactions table
-- Backfill existing rows with 'Crushed Stone' as default (the original default in pricing)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS material_type text NOT NULL DEFAULT 'Crushed Stone';

-- Drop the server-side default after backfill so future inserts must supply it explicitly
ALTER TABLE transactions
  ALTER COLUMN material_type DROP DEFAULT;
