# LinkPlay — PRD

## Original Problem Statement
"Name - linkplay, ek aise website jiske frontpage pr terabox ki link paste krne ka option ho aur jab link paste kru tab video play ho jaaye terabox ki"

## User-confirmed Choices (across iterations)
- Terabox extraction via configurable `TERABOX_API_URL` env var (default: `wdzone-terabox-api.vercel.app/api`).
- Freemium: Free tier limited to 3 links/day (server-side, MongoDB TTL). Pro tier ₹49/month unlocks unlimited + HD.
- Razorpay integration with env-switch `RAZORPAY_MODE=mock|live` — auto-falls back to mock when keys empty.
- Google OAuth alongside JWT email/password (Emergent-managed).
- Cinematic dark theme, no purple gradients.
- Frontend never touches third-party services directly; all sensitive ops server-side.

## Architecture
- **Backend**: FastAPI + Motor (MongoDB), bcrypt + PyJWT auth, httpx for upstream calls, `razorpay` SDK, MongoDB TTL for rate limits.
- **Frontend**: React 19, Tailwind, shadcn/ui, sonner. Cabinet Grotesk (display) + JetBrains Mono + Outfit fonts.
- **Persistence collections**: `users`, `history`, `favorites`, `continue_watching`, `orders`, `rate_limits (TTL)`.
- **CORS**: single-origin from `FRONTEND_URL`, credentials enabled.

## What's Been Implemented
### Iteration 1 (2026-02-15)
- Cinematic UI + email/password auth + basic Terabox extractor + mock Razorpay + localStorage history.

### Iteration 2 (2026-02-15)
- Server-side quota + rate limiting via MongoDB TTL (per-user or per-IP).
- Full Razorpay integration with env-switch (mode=mock|live), create-order/verify/webhook endpoints with HMAC signature verification.
- Emergent Google OAuth: frontend button + `AuthCallback` component + backend `/api/auth/google/session` exchange endpoint (backend calls Emergent, frontend never does).
- Persisted history/favorites/continue-watching/preferences endpoints (all `/api/*`).
- VideoPanel: heart button to favorite; auto-save resume position every 10s to `/api/continue-watching`.
- New sections: Continue Watching (with progress bars) + Favorites (only shown when logged in).
- Frontend consumes `/api/quota` from server for the header indicator (no more localStorage).
- Razorpay Checkout script loaded from `checkout.razorpay.com` in `index.html`; PaymentModal picks mock vs live based on `/api/subscribe/config`.

## Backlog / Next Steps
- **P0**: Add real Razorpay keys → `RAZORPAY_MODE=live` + `RAZORPAY_KEY_ID/SECRET/WEBHOOK_SECRET` in `/app/backend/.env`.
- **P1**: Register the webhook URL in Razorpay dashboard: `{FRONTEND_URL}/api/webhook/razorpay`.
- **P2**: Migration for existing users who signed up before `user_id`/preferences fields — currently the app tolerates missing fields.
- **P2**: Per-user quality preference wired to a source-selector (currently only stored in preferences).
- **P2**: Downgrade cron: mark users as free when `subscription_expires_at < now`.
- **P2**: Shareable preview page for a played link (WhatsApp/Telegram growth loop).
