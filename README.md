# Chalk

Chalk is a React prototype for a social prediction-market app. Users join private or public communities, create YES / NO markets, trade contracts with shifting prices, resolve outcomes through trust or moderation workflows, and spend credits on profile cosmetics.

## Stack

- Frontend: React + Vite
- Hosting: Vercel
- Backend target: Supabase
- Credit economy: 100 credits = 1 USD reference value

## Run

```bash
npm install
npm run dev
```

## Product Surfaces

- Live YES / NO market board with dynamic prices
- Private groups and public communities with creation costs
- Creator, third-party, community-vote, and app-approved resolution paths
- Instant winner payout simulation
- Disputes, reports, and escalating sanctions copy
- Profile achievements, rival records, receipt cards, and cosmetics shop
- Group leaderboard, season pot, and DMs

## Supabase Tables To Add Next

- `profiles`: user profile, credits, streak, cosmetics, public stats
- `communities`: private/public communities, moderation status, season settings
- `community_members`: role, joined date, invite status
- `markets`: question, community, creator, resolver mode, status, close time, liquidity
- `positions`: user, market, side, shares, average price
- `trades`: audit trail for contract purchases and payouts
- `resolutions`: outcome, resolver, voting record, dispute window
- `reports`: reporter, accused user, market, reason, vote count, sanction result
- `messages`: sender, recipient/thread, body, created date
- `cosmetics`: item catalog and profile inventory
