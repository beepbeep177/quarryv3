/*
  # Fix user profile auto-registration

  When the roles migration was applied to an existing Supabase project the
  backfill SQL may not have had access to auth.users (permission restrictions
  on some Supabase plans), leaving existing users with no app_users row.
  Because the INSERT policy on transactions now requires is_manager() = true,
  those users receive a 400 Bad Request on every write.

  This migration:
  1. Adds a self-registration INSERT policy on app_users so authenticated
     users can create their own row (needed by the RPC below).
  2. Creates ensure_user_profile() — a SECURITY DEFINER function that
     clients can call via RPC.  If the caller has no app_users row it
     inserts one, making them manager if no manager exists yet, otherwise
     operator.  Re-runs are safe (ON CONFLICT DO UPDATE).
  3. Re-runs the original backfill using the SECURITY DEFINER context so
     auth.users is always accessible.
*/

-- 1. Let authenticated users insert their own app_users row
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'app_users'
      AND policyname = 'Users can register themselves'
  ) THEN
    CREATE POLICY "Users can register themselves"
      ON public.app_users FOR INSERT
      TO authenticated
      WITH CHECK (id = auth.uid());
  END IF;
END$$;

-- 2. ensure_user_profile RPC
CREATE OR REPLACE FUNCTION public.ensure_user_profile()
RETURNS public.app_users
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid   uuid := auth.uid();
  _email text;
  _role  text;
  _row   public.app_users;
BEGIN
  -- Return immediately if the row already exists
  SELECT * INTO _row FROM public.app_users WHERE id = _uid;
  IF FOUND THEN
    RETURN _row;
  END IF;

  -- Fetch email from auth schema (accessible because SECURITY DEFINER)
  SELECT email INTO _email FROM auth.users WHERE id = _uid;

  -- First caller with no existing manager becomes manager
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE role = 'manager') THEN
    _role := 'manager';
  ELSE
    _role := 'operator';
  END IF;

  INSERT INTO public.app_users (id, email, role)
  VALUES (_uid, COALESCE(_email, ''), _role)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        updated_at = now()
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_profile() TO authenticated;

-- 3. Re-run backfill inside SECURITY DEFINER context via anonymous block
DO $$
DECLARE
  _first_id uuid;
BEGIN
  -- Insert all auth users that are not yet in app_users
  INSERT INTO public.app_users (id, email, role, created_at, updated_at)
  SELECT
    u.id,
    COALESCE(u.email, ''),
    'operator',
    COALESCE(u.created_at, now()),
    now()
  FROM auth.users u
  ON CONFLICT (id) DO UPDATE
    SET email      = EXCLUDED.email,
        updated_at = now();

  -- Promote the earliest user to manager if no manager exists yet
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE role = 'manager') THEN
    SELECT u.id INTO _first_id
    FROM auth.users u
    ORDER BY u.created_at ASC NULLS LAST, u.id ASC
    LIMIT 1;

    IF _first_id IS NOT NULL THEN
      UPDATE public.app_users
      SET role = 'manager', updated_at = now()
      WHERE id = _first_id;
    END IF;
  END IF;
END$$;
