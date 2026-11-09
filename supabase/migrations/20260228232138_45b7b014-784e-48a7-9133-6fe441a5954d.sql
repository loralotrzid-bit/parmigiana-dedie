-- Allow driver chat inserts (drivers don't have auth sessions)
-- Add a PERMISSIVE policy so at least one permissive policy passes
CREATE POLICY "Anyone can insert chat messages"
ON public.chat_messages
FOR INSERT
WITH CHECK (true);

-- Also allow anyone to read chat messages for their order (drivers need this)
CREATE POLICY "Anyone can read chat messages"  
ON public.chat_messages
FOR SELECT
USING (true);
