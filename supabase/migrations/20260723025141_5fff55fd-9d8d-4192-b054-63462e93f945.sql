
ALTER TABLE public.friendships
  DROP CONSTRAINT friendships_user_id_fkey,
  DROP CONSTRAINT friendships_friend_id_fkey,
  ADD CONSTRAINT friendships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT friendships_friend_id_fkey FOREIGN KEY (friend_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

ALTER TABLE public.friend_requests
  DROP CONSTRAINT friend_requests_sender_id_fkey,
  DROP CONSTRAINT friend_requests_recipient_id_fkey,
  ADD CONSTRAINT friend_requests_sender_id_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT friend_requests_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

NOTIFY pgrst, 'reload schema';
