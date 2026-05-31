/*
  # Add DELETE policies for customers, trucks, and pricing tables

  Transactions already have a DELETE policy from the initial migration.
  This adds the missing DELETE policies so the app can remove records.
*/

CREATE POLICY "Authenticated users can delete customers"
  ON customers FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete trucks"
  ON trucks FOR DELETE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete pricing"
  ON pricing FOR DELETE
  TO authenticated
  USING (true);
