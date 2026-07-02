-- Add attachment URLs to transactions and storage bucket/policies for uploads.
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS attachment_urls text[] NOT NULL DEFAULT '{}';

INSERT INTO storage.buckets (id, name, public)
SELECT 'transaction-attachments', 'transaction-attachments', true
WHERE NOT EXISTS (
  SELECT 1 FROM storage.buckets WHERE id = 'transaction-attachments'
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated can view transaction attachments'
  ) THEN
    CREATE POLICY "Authenticated can view transaction attachments"
      ON storage.objects
      FOR SELECT
      TO authenticated
      USING (bucket_id = 'transaction-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated can upload transaction attachments'
  ) THEN
    CREATE POLICY "Authenticated can upload transaction attachments"
      ON storage.objects
      FOR INSERT
      TO authenticated
      WITH CHECK (bucket_id = 'transaction-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated can update transaction attachments'
  ) THEN
    CREATE POLICY "Authenticated can update transaction attachments"
      ON storage.objects
      FOR UPDATE
      TO authenticated
      USING (bucket_id = 'transaction-attachments')
      WITH CHECK (bucket_id = 'transaction-attachments');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Authenticated can delete transaction attachments'
  ) THEN
    CREATE POLICY "Authenticated can delete transaction attachments"
      ON storage.objects
      FOR DELETE
      TO authenticated
      USING (bucket_id = 'transaction-attachments');
  END IF;
END $$;
