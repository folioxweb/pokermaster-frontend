# PokerMaster Frontend

React (JavaScript) + Vite + Web Audio API + SVG Sprite driven **No-Limit Texas Hold'em Ring Table (3 to 8 Players)**.

## Key Features
- **Elliptical Dynamic Seating Math:** Automatically distributes 3 to 8 players around an oval velvet table with the active player (Hero) anchored at bottom-center.
- **Ultra-lightweight Vector Assets:** Single SVG sprite deck (all 52 cards + luxury gold card back) and SVG chip denominations.
- **Web Audio API Procedural Audio:** Zero external audio file lag for chip clinks, card snaps, table knocks, and timer countdown ticks.
- **Full Texas Hold'em State Machine:** Fold, Check, Call, Raise with WSOP Full Raise rule and WSOP incomplete all-in rules.
- **Local Practice AI Mode & Live Supabase Multiplayer:** Allows instant testing of realistic hands against AI bots or real players.
- **CI/CD to Cloudflare Pages:** Automated GitHub Actions deployment.

## Local Development
```bash
npm install
npm run dev
```

## Cloudflare Pages Deployment
Configure the following secrets in GitHub repository (`pokermaster-frontend` -> Settings -> Secrets and variables -> Actions):
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_PROJECT_NAME`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
