/*
  # Fix transactions INSERT policy to allow operators (encoders) to add daily entries

  The previous policy only allowed managers to INSERT transactions.
  However, operators are used as "encoders" in this system and need to be
  able to add daily ledger entries.

  This migration:
  1. Replaces the manager-only INSERT policy with one that allows any
     authenticated user who has an app_users profile to insert transactions.
  2. UPDATE and DELETE remain restricted to managers only.
*/

DROP POLICY IF EXISTS "Managers can insert transactions" ON public.transactions;

CREATE POLICY "App users can insert transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.app_users WHERE id = auth.uid()
    )
  );
