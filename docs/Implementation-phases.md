# 1) Backend foundation (API-first)
Scaffold NestJS app with modules (Auth, Users, Orgs, Opportunities, Applications, Messaging, Reviews, Admin)
Add OpenAPI/Swagger + versioning (/v1)
Implement logging, error handling, rate limiting, request validation

# 2) Database + migrations
Design core schema (Postgres + PostGIS)
Add migrations + seed scripts
Implement repository/data-access layer (Prisma/TypeORM)

# 3) Authentication + authorization
Implement auth (JWT + refresh tokens or provider integration)
Role system (Volunteer, Individual Requester, Org Admin, Moderator)
RBAC guards + permission checks per endpoint

# 4) Core domain APIs (build in this order)
Users + profiles (role-flexible)
Organizations (create/manage, org members)
Opportunities/requests (create/edit/publish, remote/in-person/hybrid)
Discovery (list/search/filter/sort, geospatial queries)
Applications (apply/accept/decline/cancel + status transitions)
Reviews + ratings (two-sided, role-specific)
Impact log (hours/outcomes)

# 5) Web UI (Next.js) aligned to the same order
Auth pages + onboarding (role selection)
Profile + org pages
Post opportunity flow (wizard-style)
Browse/search pages + opportunity detail page (SEO-friendly)
Apply/accept workflow + dashboards (“My Applications”, “My Posts”)
Completion + reviews + impact history

# 6) Messaging + notifications
Add chat per opportunity (WebSocket or managed realtime)
Mask contact info until match
Notification service: email first, then SMS/push later
Background jobs (Redis queue): reminders, expirations, digests

# 7) Trust & safety (baseline)
Reporting/blocking endpoints + UI entry points
Fuzzy location until accepted; exact address gated
Verification tiers (basic/trusted/org verified) + enforcement by category
Admin moderation queue + audit logs