# SQL utilities

## Seed super admin

This project stores platform admin permissions in the `platform_admins` table.

To create or reset the super admin account `admin@admin.com` with password `123456789`, run:

```bash
psql "$DATABASE_URL" -f backend/sql/seed_super_admin.sql
```

After running, you should be able to sign in and access **Admin → User Management**.

Security note: rotate this password immediately in non-local environments.