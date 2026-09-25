---
status: accepted
date: 2026-09-25
---
# 0041. Email + password accounts, user tiers, and an admin panel

## Context
The user wants email and password sign-in next to Google, with a simple register form and no email
service yet (it costs money, and this is still testing). They also want tiers (free, paid, admin),
with everyone on paid for now and joao.pedro.manso@gmail.com the only admin. The admin panel must
be for admins only: clear data, see statistics (2026-09-25).

The Worker's free plan allows about 10 ms of CPU per request, too little for a slow password hash
on the server.

## Decision
- **Passwords never reach the server.** The browser stretches the password with PBKDF2-SHA256
  (300,000 rounds, salted with `glue-v1:` + the lower-case email) and sends the 256-bit result.
  The server keeps only `SHA-256(random salt : key)`, compared in constant time.
  - A leaked database gives nothing to sign in with, and each guess still costs 300k rounds.
  - Limits: 10 guesses per email and 30 per address per 10 minutes, and 10 registrations per
    address.
  - Passwords need 8+ characters.
- **No email check yet**, so an email address proves nothing. Registering an email that already
  has a password account is refused. A Google sign-in with the same email gets its own account;
  linking the two is later.
- **Tiers:** `users.tier` is `free | paid | admin`, with default `paid`. Limits: cloud storage 50 MB
  free, 300 MB paid, 1 GB admin; more limits as needed. Admins change tiers in the panel, but not
  their own.
- **Admin:** only through a **Google-verified** email listed in `ADMIN_EMAILS` (wrangler vars),
  set at each Google sign-in. A password account with that email stays paid; that's tested.
  Every `/v1/admin/*` call re-checks the tier.
- **Admin panel** (`#/admin`, and an "Admin" tab only for admins):
  - statistics: users by tier and sign-in method, new this week / month, active this week,
    devices, cloud data, merges, waiting edits, a 30-day sign-up chart;
  - users: search, tier, devices, cloud size, last seen; clear their cloud data; delete the account
    (type the email);
  - maintenance: used and expired pairing codes, expired sessions, rate limits, edits older than 90
    days, devices removed 30+ days ago.

## Alternatives considered
- **Server-side PBKDF2 / scrypt:** over the free CPU budget. Workers Paid ($5/month) would allow it;
  the client-side stretch can stay in front of it either way.
- **Email magic links:** need a sending domain and service; later, with email verification.

## Consequences
- **Reset is by admin only:** a forgotten password can't be reset without email; for now the
  admin can delete the account.
- Once email verification exists, verified password accounts could link to Google accounts with
  the same address, and admin could come from either.
