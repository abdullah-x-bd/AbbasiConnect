# ABC | Abbasi Bahishti Connections

A separate Expo 58 Android app for structured conversational matrimonial onboarding, distinct from the legacy AbbasiConnect mobile app.

## Architecture
- API: the isolated Fastify \`/abc/*\` routes on the existing Render server.
- Database: dedicated \`AbcRegistration\`, \`AbcAccount\`, \`AbcSmsChallenge\` and \`AbcInterest\` models in PostgreSQL with Supabase Data API privileges revoked and RLS enabled.
- AI: OpenRouter \`google/gemini-3.1-flash-lite\`, two calls per answer: strict JSON extraction and tightly scoped question wording. The server determines required fields and completion.
- Audio: Expo Audio recording, OpenRouter Whisper STT, device text-to-speech.
- Authentication: reverse SMS via a dedicated inbound gateway and six-digit PIN hash. No SMS receive or read permissions in the user's mobile app.

## Run
\`\`\`bash
npm install
npm run typecheck -w @abbasiconnect/bahishti
cd apps/bahishti && npx expo start
\`\`\`

## Configuration
- Render already has \`DATABASE_URL\`, \`JWT_SECRET\`, \`OPENROUTER_API_KEY\`.
- On Render, set \`ABC_SMS_NUMBER=+91...your dedicated receiving SIM...\`.
- Set \`ABC_SMS_WEBHOOK_SECRET\` to a long random secret, unique to this app.
- Configure the dedicated SMS gateway Android phone to POST inbound data to \`https://abbasiconnect-api.onrender.com/abc/sms/inbound\` as JSON with \`{"from":"+91...","message":"ABC VERIFY 123456"}\` and \`Authorization: Bearer <secret>\`. This is a configurable adapter contract; gateway vendors may need a small field mapping.
- \`ABC_OPENROUTER_MODEL\` defaults to \`google/gemini-3.1-flash-lite\`; \`ABC_STT_MODEL\` defaults to \`openai/whisper-1\`.

There is no user-facing fake OTP bypass. The phone must send an SMS, and the configured gateway must confirm receipt from the exact phone number. Until gateway configuration is complete, the verified-registration step correctly reports that it is unavailable and preserves the interview.

The new app can be installed alongside AbbasiConnect because its Android application ID is \`org.abbasiconnect.bahishti\`.
