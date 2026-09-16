# PR181 Founder Operations Dashboard

## Purpose

Give the configured founder a single, privacy-conscious view of whether private access works, members are engaging, reminders are being delivered, and AI features are operating reliably and economically.

## Access and privacy contract

- `/founder` requires a verified Supabase session and the configured `LVE360_FOUNDER_USER_ID`.
- Non-founders are redirected to `/today`; signed-out visitors are redirected to login.
- The page reads aggregate operational metadata with the server-only Supabase admin client.
- The page does not query or render medications, hormones, supplements, health profiles, reflections, prompts, or AI responses.
- PR181 adds no database schema and no destructive controls.

## Founder controls

- Review, approve, issue, replace, copy, and revoke invitations through the existing access-request console.
- See invitation issuance and acceptance as separate operational gates.
- Open Vercel, Supabase, and GitHub in a new tab for deeper investigation.

## Verification

- `npm.cmd run qa:pr181`
- `npm.cmd run typecheck`
- `npm.cmd run build`
- `npm.cmd run qa:env`
- `npm.cmd run qa:pr180`

The local production build may use non-sensitive placeholder values because the clean worktree does not contain production or preview secrets. Vercel Preview remains the authoritative environment-backed build.

## Rollback

Remove the `/founder` route, founder navigation item, and founder-home redirect. No database rollback is required.
