# LinkPlay — PRD

## Original Problem Statement
"Name - linkplay, ek aise website jiske frontpage pr terabox ki link paste krne ka option ho aur jab link paste kru tab video play ho jaaye terabox ki"

## User-confirmed Choices
- Terabox extraction via a free community API (env-configurable `TERABOX_API_URL`, default `wdzone-terabox-api.vercel.app/api`).
- Full feature set: paste + inline play, download button, video metadata (title/size/thumbnail), and recently-played history.
- Modern cinematic dark theme (crimson + gold accents, no purple gradients).
- No login required for free usage. Sign-up + payment required only for the ₹49/month Pro subscription.
- Payment: **MOCKED** Razorpay flow (UI complete; will go live when keys added).
- Rate limiting for free users: 3 links/day, tracked client-side via localStorage.
- Auth: JWT email/password (httpOnly cookies).

## Architecture
- **Backend**: FastAPI + Motor (MongoDB). httpx for calling upstream Terabox extractor. bcrypt + PyJWT for auth.
- **Frontend**: React 19, TailwindCSS, shadcn/ui, sonner, lucide-react, framer-motion. Fonts: Cabinet Grotesk (display), JetBrains Mono, Outfit.

## What's Been Implemented (2026-02-15)
- ✅ Cinematic dark UI (Header with quota, Hero paste input, Video player, Info Bento, History, Pricing card, Footer).
- ✅ Auth: register/login/logout/me with httpOnly cookies. Bcrypt hashing.
- ✅ Terabox extractor endpoint (`POST /api/terabox/extract`) with URL validation + multi-schema response normalization.
- ✅ Inline HTML5 video player with poster + download button + view-original link.
- ✅ localStorage history (last 12) + daily quota gating.
- ✅ MOCKED Razorpay subscribe flow (`POST /api/subscribe/mock`) — instantly upgrades user to Pro for 30 days.
- ✅ Sonner toast notifications on all events.

## Backlog / Next Steps
- **P0**: Wire real Razorpay checkout (need `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`).
- **P1**: Replace default Terabox extractor URL with user's own endpoint via `.env`.
- **P1**: Server-side quota tracking for authenticated users (localStorage is bypassable).
- **P2**: Emergent Google OAuth login (in addition to email/password).
- **P2**: Persistent per-account history in MongoDB when logged in.
- **P2**: Support for multiple video qualities (SD/HD) when upstream provides them.
- **P2**: Sharing / short-links to a preview page.

## Personas
- **Casual user**: Grabs a Terabox share link from a friend, wants to watch without downloading.
- **Power user**: Watches many Terabox links a day → converts to Pro for unlimited playback + HD.

## Core Requirements (static)
- Front-page-first: paste input is the hero. Zero friction for free playback.
- No login required for the free tier.
- Cinematic dark aesthetic. No purple/violet gradients.
