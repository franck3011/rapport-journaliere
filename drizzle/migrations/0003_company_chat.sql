CREATE OR REPLACE FUNCTION public.is_company_member(_company_id uuid, _user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.company_members WHERE company_id = _company_id AND user_id = _user_id)
$$;

CREATE TABLE public.company_chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL,
  recipient_id uuid,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX company_chat_messages_company_idx ON public.company_chat_messages(company_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.company_chat_messages TO authenticated;
GRANT ALL ON public.company_chat_messages TO service_role;
ALTER TABLE public.company_chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "members read company chat" ON public.company_chat_messages FOR SELECT TO authenticated
USING (public.is_company_member(company_id, auth.uid())
  AND (recipient_id IS NULL OR sender_id = auth.uid() OR recipient_id = auth.uid()));

CREATE POLICY "members send company chat" ON public.company_chat_messages FOR INSERT TO authenticated
WITH CHECK (sender_id = auth.uid() AND public.is_company_member(company_id, auth.uid())
  AND (recipient_id IS NULL OR public.is_company_member(company_id, recipient_id)));

CREATE POLICY "sender deletes own chat" ON public.company_chat_messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

CREATE OR REPLACE FUNCTION public.company_chat_colleagues()
RETURNS TABLE(company_id uuid, company_name text, user_id uuid, full_name text, email text, avatar_url text, position_title text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.company_id, c.name, m.user_id, p.full_name, p.email, p.avatar_url, m.position_title
  FROM public.company_members me
  JOIN public.company_members m ON m.company_id = me.company_id
  JOIN public.companies c ON c.id = m.company_id
  LEFT JOIN public.profiles p ON p.id = m.user_id
  WHERE me.user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.company_chat_colleagues() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.company_chat_colleagues() TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.company_chat_messages;