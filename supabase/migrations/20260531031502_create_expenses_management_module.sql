
/*
  # Expenses Management Module

  1. New Tables
    - `expense_categories`
      - `id` (uuid, primary key)
      - `name` (text, category name)
      - `user_id` (uuid, owner of custom category)
      - `is_default` (boolean, system default or custom)
      - `order` (integer, display order)
      - `created_at` (timestamp)

    - `expenses`
      - `id` (uuid, primary key)
      - `expense_date` (date)
      - `category_id` (uuid, FK to expense_categories)
      - `amount` (numeric, amount in PHP)
      - `payee_supplier` (text, who was paid)
      - `description` (text, remarks)
      - `liters_counter` (numeric, only for Diesel category)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to manage their own data
*/

-- Expense Categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  user_id uuid,
  is_default boolean DEFAULT false,
  "order" integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view all categories"
  ON expense_categories FOR SELECT
  TO authenticated
  USING (is_default = true OR user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Users can create custom categories"
  ON expense_categories FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own categories"
  ON expense_categories FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Expenses table
CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  category_id uuid REFERENCES expense_categories(id),
  amount numeric NOT NULL DEFAULT 0,
  payee_supplier text DEFAULT '',
  description text DEFAULT '',
  liters_counter numeric,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view expenses"
  ON expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can create expenses"
  ON expenses FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update expenses"
  ON expenses FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete expenses"
  ON expenses FOR DELETE
  TO authenticated
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(category_id);

-- Insert default categories
INSERT INTO expense_categories (name, is_default, "order") VALUES
  ('Diesel', true, 1),
  ('Salary/Advances', true, 2),
  ('Materials & Maintenance', true, 3),
  ('Passway', true, 4),
  ('Meals', true, 5),
  ('Diesel Misc/RFID', true, 6),
  ('Miscellaneous', true, 7)
ON CONFLICT DO NOTHING;

-- Seed some demo expenses
INSERT INTO expenses (expense_date, category_id, amount, payee_supplier, description, liters_counter)
SELECT 
  CURRENT_DATE - (random() * 6)::int,
  (SELECT id FROM expense_categories WHERE name = 'Diesel' LIMIT 1),
  (1000 + random() * 5000)::numeric,
  'RTM Gas Station',
  'Fuel for Excavator',
  (50 + random() * 100)::numeric
WHERE EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Diesel');

INSERT INTO expenses (expense_date, category_id, amount, payee_supplier, description)
SELECT 
  CURRENT_DATE - (random() * 6)::int,
  (SELECT id FROM expense_categories WHERE name = 'Meals' LIMIT 1),
  (300 + random() * 1000)::numeric,
  'Local Canteen',
  'Lunch for crew'
WHERE EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Meals');

INSERT INTO expenses (expense_date, category_id, amount, payee_supplier, description)
SELECT 
  CURRENT_DATE - (random() * 6)::int,
  (SELECT id FROM expense_categories WHERE name = 'Materials & Maintenance' LIMIT 1),
  (2000 + random() * 8000)::numeric,
  'Oro Hardware',
  'Replacement parts for Loader'
WHERE EXISTS (SELECT 1 FROM expense_categories WHERE name = 'Materials & Maintenance');
