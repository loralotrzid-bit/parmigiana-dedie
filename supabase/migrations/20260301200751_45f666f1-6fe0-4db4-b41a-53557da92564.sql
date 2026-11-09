-- Add target_type column to separate restaurant vs driver conversations
ALTER TABLE public.chat_messages 
ADD COLUMN target_type text NOT NULL DEFAULT 'restaurant';

-- Update existing driver messages to have target_type = 'driver'
UPDATE public.chat_messages SET target_type = 'driver' WHERE sender_type = 'driver';
