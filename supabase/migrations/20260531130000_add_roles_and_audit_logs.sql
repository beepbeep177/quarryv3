/*
  # Add user roles and audit logging

  1. New tables
    - `app_users`
      - Stores each authenticated user's email and application role
      - First registered user becomes manager, later users default to operator
    - `audit_logs`
      - Tracks inserts, updates, and deletes across key business tables

  2. Security
    - Operators remain read-only across business records
    - Managers can manage records, assign roles, and view audit logs
*/

CREATE TABLE IF NOT EXISTS public.app_users (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'operator' CHECK (role IN ('manager', 'operator')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.app_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.is_manager(check_user_id uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE id = check_user_id
      AND role = 'manager'
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_app_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.app_users (id, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    CASE
      WHEN EXISTS (SELECT 1 FROM public.app_users) THEN 'operator'
      ELSE 'manager'
    END
  )
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.prevent_last_manager_removal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'manager' AND (TG_OP = 'DELETE' OR NEW.role <> 'manager') THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.app_users
      WHERE role = 'manager'
        AND id <> OLD.id
    ) THEN
      RAISE EXCEPTION 'At least one manager is required.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_audit_log()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor_id uuid := auth.uid();
  actor_email_value text;
BEGIN
  IF TG_OP = 'UPDATE' AND to_jsonb(OLD) = to_jsonb(NEW) THEN
    RETURN NEW;
  END IF;

  SELECT email
    INTO actor_email_value
  FROM public.app_users
  WHERE id = actor_id;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_user_id, actor_email, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', actor_id, COALESCE(actor_email_value, NEW.email), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_user_id, actor_email, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', actor_id, actor_email_value, to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_user_id, actor_email, old_data)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', actor_id, actor_email_value, to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

INSERT INTO public.app_users (id, email, role, created_at, updated_at)
SELECT id, COALESCE(email, ''), 'operator', COALESCE(created_at, now()), now()
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET email = EXCLUDED.email;

WITH first_user AS (
  SELECT id
  FROM auth.users
  ORDER BY created_at ASC NULLS LAST, id ASC
  LIMIT 1
)
UPDATE public.app_users
SET role = 'manager',
    updated_at = now()
WHERE id IN (SELECT id FROM first_user)
  AND NOT EXISTS (
    SELECT 1
    FROM public.app_users
    WHERE role = 'manager'
  );

DROP TRIGGER IF EXISTS set_app_users_updated_at ON public.app_users;
CREATE TRIGGER set_app_users_updated_at
BEFORE UPDATE ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_app_user();

DROP TRIGGER IF EXISTS prevent_last_manager_update ON public.app_users;
CREATE TRIGGER prevent_last_manager_update
BEFORE UPDATE OF role ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_manager_removal();

DROP TRIGGER IF EXISTS prevent_last_manager_delete ON public.app_users;
CREATE TRIGGER prevent_last_manager_delete
BEFORE DELETE ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.prevent_last_manager_removal();

DROP TRIGGER IF EXISTS audit_app_users ON public.app_users;
CREATE TRIGGER audit_app_users
AFTER INSERT OR UPDATE OR DELETE ON public.app_users
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP TRIGGER IF EXISTS audit_customers ON public.customers;
CREATE TRIGGER audit_customers
AFTER INSERT OR UPDATE OR DELETE ON public.customers
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP TRIGGER IF EXISTS audit_trucks ON public.trucks;
CREATE TRIGGER audit_trucks
AFTER INSERT OR UPDATE OR DELETE ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP TRIGGER IF EXISTS audit_pricing ON public.pricing;
CREATE TRIGGER audit_pricing
AFTER INSERT OR UPDATE OR DELETE ON public.pricing
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP TRIGGER IF EXISTS audit_transactions ON public.transactions;
CREATE TRIGGER audit_transactions
AFTER INSERT OR UPDATE OR DELETE ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP TRIGGER IF EXISTS audit_expense_categories ON public.expense_categories;
CREATE TRIGGER audit_expense_categories
AFTER INSERT OR UPDATE OR DELETE ON public.expense_categories
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP TRIGGER IF EXISTS audit_expenses ON public.expenses;
CREATE TRIGGER audit_expenses
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW
EXECUTE FUNCTION public.record_audit_log();

DROP POLICY IF EXISTS "Users can view own profile" ON public.app_users;
DROP POLICY IF EXISTS "Managers can update user roles" ON public.app_users;
DROP POLICY IF EXISTS "Managers can view audit logs" ON public.audit_logs;

CREATE POLICY "Users can view own profile"
  ON public.app_users FOR SELECT
  TO authenticated
  USING (id = auth.uid() OR public.is_manager());

CREATE POLICY "Managers can update user roles"
  ON public.app_users FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can insert customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can update customers" ON public.customers;
DROP POLICY IF EXISTS "Authenticated users can delete customers" ON public.customers;

CREATE POLICY "Managers can insert customers"
  ON public.customers FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can update customers"
  ON public.customers FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete customers"
  ON public.customers FOR DELETE
  TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can insert trucks" ON public.trucks;
DROP POLICY IF EXISTS "Authenticated users can update trucks" ON public.trucks;
DROP POLICY IF EXISTS "Authenticated users can delete trucks" ON public.trucks;

CREATE POLICY "Managers can insert trucks"
  ON public.trucks FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can update trucks"
  ON public.trucks FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete trucks"
  ON public.trucks FOR DELETE
  TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can insert pricing" ON public.pricing;
DROP POLICY IF EXISTS "Authenticated users can update pricing" ON public.pricing;
DROP POLICY IF EXISTS "Authenticated users can delete pricing" ON public.pricing;

CREATE POLICY "Managers can insert pricing"
  ON public.pricing FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can update pricing"
  ON public.pricing FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete pricing"
  ON public.pricing FOR DELETE
  TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can insert transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can update transactions" ON public.transactions;
DROP POLICY IF EXISTS "Authenticated users can delete transactions" ON public.transactions;

CREATE POLICY "Managers can insert transactions"
  ON public.transactions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can update transactions"
  ON public.transactions FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete transactions"
  ON public.transactions FOR DELETE
  TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Users can view all categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can create custom categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Users can update own categories" ON public.expense_categories;
DROP POLICY IF EXISTS "Managers can delete expense categories" ON public.expense_categories;

CREATE POLICY "Users can view expense categories"
  ON public.expense_categories FOR SELECT
  TO authenticated
  USING (is_default = true OR user_id = auth.uid() OR user_id IS NULL OR public.is_manager());

CREATE POLICY "Managers can create expense categories"
  ON public.expense_categories FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can update expense categories"
  ON public.expense_categories FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete expense categories"
  ON public.expense_categories FOR DELETE
  TO authenticated
  USING (public.is_manager());

DROP POLICY IF EXISTS "Authenticated users can create expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated users can update expenses" ON public.expenses;
DROP POLICY IF EXISTS "Authenticated users can delete expenses" ON public.expenses;

CREATE POLICY "Managers can create expenses"
  ON public.expenses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can update expenses"
  ON public.expenses FOR UPDATE
  TO authenticated
  USING (public.is_manager())
  WITH CHECK (public.is_manager());

CREATE POLICY "Managers can delete expenses"
  ON public.expenses FOR DELETE
  TO authenticated
  USING (public.is_manager());
