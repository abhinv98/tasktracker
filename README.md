# The Orchestrator

A hierarchical RBAC task tracking application built with Convex + Next.js (App Router).

## Design

"Anthropic Editorial" — high contrast, serif body text, flat borders, no rounded corners. Poppins + Lora + JetBrains Mono.

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Ensure `.env.local` has:
   - `CONVEX_DEPLOYMENT` (e.g. `dev:coordinated-pika-8`)
   - `CONVEX_DEPLOY_KEY` (from Convex dashboard)
   - `NEXT_PUBLIC_CONVEX_URL` (e.g. `https://coordinated-pika-8.eu-west-1.convex.cloud`)

3. Run Convex dev (pushes schema & functions):
   ```bash
   npx convex dev
   ```

4. Run Next.js:
   ```bash
   npm run dev
   ```

5. Open http://localhost:3000

## Auth

- Sign up with email/password
- First user to sign up becomes admin
- Only admins can promote users to manager/admin via Users & Roles

## Roles

- **Admin**: Full access — users, teams, briefs, archive
- **Manager**: Assigned briefs, team view, archive
- **Employee**: My Queue, deliverables, profile

## Key Features

- Briefs with tasks, teams, managers
- The Briefing Room: 3-column layout (Quill, Constellation placeholder, Ledger)
- Team load view (Ledger)
- Archive with restore
- Notifications
- Activity log
