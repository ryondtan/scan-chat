# Lumen roadmap

## Done
- Secure admin system: `user_roles` table (admin/moderator), database-enforced `is_admin()`, owner auto-grant for ryond_audric@pluit.ipeka.sch.id on verified email.
- Admin console at `/admin` (aggregate stats, staff roles, allowed sign-up domains, audit log). No access to private messages, files, or credentials.
- Allowed sign-up email domains (seeded with pluit.ipeka.sch.id), enforced at sign-up and managed by admins.

## Next
- Chat attachments: Hybrid + WebRTC (chosen by owner)
  - Sender keeps original file locally (IndexedDB/OPFS) and offers P2P WebRTC transfer when both peers are online.
  - Fallback: compressed/encrypted copy in cloud storage with TTL so large originals aren't kept forever.
  - Message row stores a descriptor (hash, size, type, availability) instead of a permanent storage key.
- Optional: 2FA for admin accounts.
