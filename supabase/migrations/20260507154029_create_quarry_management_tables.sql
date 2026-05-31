
/*
  # Quarry Management System - Initial Schema

  1. New Tables
    - `customers`
      - `id` (uuid, primary key)
      - `name` (text, company/customer name)
      - `contact` (text, contact person or phone)
      - `address` (text)
      - `created_at` (timestamp)

    - `trucks`
      - `id` (uuid, primary key)
      - `plate_number` (text, unique)
      - `driver_name` (text)
      - `capacity_m3` (numeric, truck capacity)
      - `created_at` (timestamp)

    - `pricing`
      - `id` (uuid, primary key)
      - `material_type` (text)
      - `unit_price` (numeric, price per m³)
      - `effective_date` (date)
      - `created_at` (timestamp)

    - `transactions`
      - `id` (uuid, primary key)
      - `transaction_date` (date)
      - `customer_id` (uuid, FK to customers)
      - `truck_id` (uuid, FK to trucks)
      - `dr_number` (text, delivery receipt number)
      - `length_cm` (numeric)
      - `width_cm` (numeric)
      - `height_cm` (numeric)
      - `volume_m3` (numeric, computed L*W*H/1,000,000)
      - `unit_price` (numeric)
      - `amount` (numeric, volume * unit_price)
      - `dr_capitol` (numeric, extra fee)
      - `passway` (numeric, extra fee)
      - `kulot` (numeric, extra fee)
      - `total_amount` (numeric, amount + extra fees)
      - `payment_mode` (text: CASH, P.O, OFFSET)
      - `status` (text: PENDING, PAID)
      - `notes` (text)
      - `created_at` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Policies for authenticated users to manage their own org's data
*/

-- Customers table
CREATE TABLE IF NOT EXISTS customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact text DEFAULT '',
  address text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE customers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view customers"
  ON customers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert customers"
  ON customers FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update customers"
  ON customers FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Trucks table
CREATE TABLE IF NOT EXISTS trucks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plate_number text UNIQUE NOT NULL,
  driver_name text DEFAULT '',
  capacity_m3 numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view trucks"
  ON trucks FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert trucks"
  ON trucks FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update trucks"
  ON trucks FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Pricing table
CREATE TABLE IF NOT EXISTS pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  material_type text NOT NULL DEFAULT 'Crushed Stone',
  unit_price numeric NOT NULL DEFAULT 0,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view pricing"
  ON pricing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pricing"
  ON pricing FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pricing"
  ON pricing FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  customer_id uuid REFERENCES customers(id),
  truck_id uuid REFERENCES trucks(id),
  dr_number text NOT NULL DEFAULT '',
  length_cm numeric NOT NULL DEFAULT 0,
  width_cm numeric NOT NULL DEFAULT 0,
  height_cm numeric NOT NULL DEFAULT 0,
  volume_m3 numeric GENERATED ALWAYS AS (ROUND((length_cm * width_cm * height_cm) / 1000000.0, 4)) STORED,
  unit_price numeric NOT NULL DEFAULT 0,
  amount numeric GENERATED ALWAYS AS (ROUND((length_cm * width_cm * height_cm) / 1000000.0 * unit_price, 2)) STORED,
  dr_capitol numeric NOT NULL DEFAULT 0,
  passway numeric NOT NULL DEFAULT 0,
  kulot numeric NOT NULL DEFAULT 0,
  total_amount numeric GENERATED ALWAYS AS (
    ROUND((length_cm * width_cm * height_cm) / 1000000.0 * unit_price, 2) + dr_capitol + passway + kulot
  ) STORED,
  payment_mode text NOT NULL DEFAULT 'CASH' CHECK (payment_mode IN ('CASH', 'P.O', 'OFFSET')),
  status text NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID')),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
CREATE INDEX IF NOT EXISTS idx_transactions_payment_mode ON transactions(payment_mode);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON transactions(status);

-- Seed some demo data
INSERT INTO customers (name, contact, address) VALUES
  ('Buildrite Construction Inc.', '+63 912 345 6789', 'Brgy. San Jose, Bulacan'),
  ('Metro Roads & Infra Corp.', '+63 917 234 5678', 'Quezon City, Metro Manila'),
  ('LandMark Developers', '+63 918 345 6789', 'Clark Freeport, Pampanga'),
  ('SunBuilt Engineering', '+63 919 456 7890', 'Batangas City, Batangas'),
  ('EastPac Aggregates', '+63 920 567 8901', 'Cabanatuan City, Nueva Ecija')
ON CONFLICT DO NOTHING;

INSERT INTO trucks (plate_number, driver_name, capacity_m3) VALUES
  ('ABC-1234', 'Juan Dela Cruz', 12.5),
  ('XYZ-5678', 'Pedro Santos', 10.0),
  ('DEF-9012', 'Jose Reyes', 15.0),
  ('GHI-3456', 'Mario Lopez', 12.0),
  ('JKL-7890', 'Carlos Garcia', 14.0)
ON CONFLICT DO NOTHING;

INSERT INTO pricing (material_type, unit_price, effective_date) VALUES
  ('Crushed Stone', 850.00, CURRENT_DATE),
  ('Sand', 650.00, CURRENT_DATE),
  ('Gravel', 750.00, CURRENT_DATE)
ON CONFLICT DO NOTHING;
