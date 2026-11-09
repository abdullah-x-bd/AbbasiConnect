# ABC Voice Call event audit

ABC v1.8.2 uploads an authenticated per-call event timeline to the existing Supabase PostgreSQL database. The Android application sends small batches to `POST /abc/live/events` without blocking the interview. The backend assigns each event to the registration derived from its verified JWT. A signed-in member can retrieve **only their own** events through `GET /abc/live/events?limit=100` or `GET /abc/live/events?callId=abc_...`.

## Inspect in Supabase

In project **abbasiconnect**, open **SQL Editor**, and run:

```sql
select
  "createdAt", "callId", "sequence", "elapsedMs",
  "eventType", "phase", "questionSequence",
  "questionPath", "preview", "detail"
from public."AbcVoiceEvent"
order by "createdAt" desc, "sequence" desc
limit 200;
```

To investigate an unwanted phrase spoken before the authorized question, compare events of types `output_unexpected`, `stray_before_question`, `question_issued`, `audio_enabled`, `output_started`, and `question_played` by `callId`, `questionSequence`, and `elapsedMs`.

Render app logs also include `ABC_VOICE_EVENT` for a small subset of notable transitions.

**Privacy and limits:** Only brief *assistant-generated* transcript snippets may be retained, capped at 160 characters and redacted for obvious emails, links and long phone-number patterns. No raw microphone samples, recognized user answers, or answer text are recorded in this audit table. Events are owned by a registration, deleted when its registration is deleted, and automatically pruned after 14 days as new events arrive. The table is protected by PostgreSQL RLS and is revoked from Supabase Data API `anon` and `authenticated` roles.

The client and telemetry API use separate request processing: an event upload failure must not block or alter the actual profile interview. Duplicate event sequences are ignored.
