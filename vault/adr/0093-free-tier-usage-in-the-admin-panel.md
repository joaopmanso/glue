---
status: accepted
date: 2026-09-28
---
# 0093. The admin panel shows free-tier usage, from Cloudflare's analytics with a read-only token

Extends [ADR 0041](0041-passwords-tiers-admin.md)'s admin panel. This is phase 6 of the
[plan for one shared collection](../product/plan-shared-collection.md).

## Context
The user (2026-09-28): "I'd like to know how much of the free tier I can still use for TURN server
for example, or space usage for sql db, stuff like that."

Cloudflare's GraphQL Analytics API has the numbers (checked on 2026-09-28 against the account):
- `d1AnalyticsAdaptiveGroups` (rows read and written per day);
- `d1StorageAdaptiveGroups` (database size);
- `workersInvocationsAdaptive` (requests and errors per day);
- `callsTurnUsageAdaptiveGroups` (relay bytes in and out).

The deploy token could read them, but it can also change Workers and databases, so it doesn't belong
in the Worker at run time.

## Decision
- **`GET /v1/admin/usage`** (admins only, `cloud/src/usage.ts`) asks the analytics API once per
  view. It returns:
  - database size;
  - rows read and written today;
  - Worker requests and errors today;
  - relay traffic this month.

  Each comes with Cloudflare's published free-plan limit **[UNVERIFIED]**: 5 GB of D1 storage,
  5 million rows read and 100,000 written a day, 100,000 Worker requests a day, and 1,000 GB of TURN
  egress a month.
- **A separate read-only token,** `CF_ANALYTICS_TOKEN` ("Account Analytics: Read"), added by the
  owner to the repository's secrets. The cloud workflow puts it into the Worker with the account id
  (`CF_ACCOUNT_ID`), as it does for the TURN key.
  - Without it, the panel shows the database size (from a query's own meta) and says what to add.
- **Admin › Free tier:** a bar per number, showing the amount and the percentage, turning warm above
  80 %.

## Consequences
- The owner sees how close GLUE Cloud is to the free plan's limits before users notice.
- The numbers are Cloudflare's own analytics: a few minutes behind, by UTC day.
- If Cloudflare renames a dataset, only that number goes missing, and the panel says why.
