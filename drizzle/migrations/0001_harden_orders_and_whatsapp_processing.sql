ALTER TABLE public.wa_conversations
  ADD COLUMN processing boolean NOT NULL DEFAULT false,
  ADD COLUMN processing_started_at timestamptz;

ALTER TABLE public.wa_messages
  ADD COLUMN webhook_status text NOT NULL DEFAULT 'done';

ALTER TABLE public.orders
  ADD COLUMN source_external_id text;

CREATE UNIQUE INDEX wa_messages_external_id_unique_idx
  ON public.wa_messages (external_id)
  WHERE external_id IS NOT NULL;

CREATE UNIQUE INDEX orders_source_external_id_unique_idx
  ON public.orders (source_external_id)
  WHERE source_external_id IS NOT NULL;

CREATE INDEX orders_status_created_idx
  ON public.orders (status, created_at DESC);

CREATE OR REPLACE FUNCTION public.claim_wa_conversation(_conversation_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _claimed boolean;
BEGIN
  UPDATE public.wa_conversations
  SET processing = true, processing_started_at = now()
  WHERE id = _conversation_id
    AND (
      processing = false
      OR processing_started_at IS NULL
      OR processing_started_at < now() - interval '3 minutes'
    );
  GET DIAGNOSTICS _claimed = ROW_COUNT;
  RETURN _claimed;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_wa_conversation(_conversation_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wa_conversations
  SET processing = false, processing_started_at = NULL
  WHERE id = _conversation_id
$$;

REVOKE ALL ON FUNCTION public.claim_wa_conversation(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_wa_conversation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_wa_conversation(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_wa_conversation(uuid) TO service_role;