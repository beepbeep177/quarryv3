/*
  # Fix audit trigger email lookup

  The shared audit trigger is attached to many tables where NEW does not have an
  `email` column (for example transactions/expenses). The previous INSERT branch
  used COALESCE(actor_email_value, NEW.email), which raises:

    record "new" has no field "email"

  This migration updates the trigger function to always use the actor email
  resolved from app_users, avoiding table-specific column assumptions.
*/

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
    VALUES (TG_TABLE_NAME, NEW.id, 'INSERT', actor_id, COALESCE(actor_email_value, ''), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_user_id, actor_email, old_data, new_data)
    VALUES (TG_TABLE_NAME, NEW.id, 'UPDATE', actor_id, COALESCE(actor_email_value, ''), to_jsonb(OLD), to_jsonb(NEW));
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (table_name, record_id, action, actor_user_id, actor_email, old_data)
    VALUES (TG_TABLE_NAME, OLD.id, 'DELETE', actor_id, COALESCE(actor_email_value, ''), to_jsonb(OLD));
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;
