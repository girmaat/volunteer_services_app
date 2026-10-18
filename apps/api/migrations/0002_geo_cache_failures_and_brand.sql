-- Cache failed geocoding lookups so they are not retried on every request.
ALTER TABLE geo_cache ALTER COLUMN lat DROP NOT NULL;
ALTER TABLE geo_cache ALTER COLUMN lng DROP NOT NULL;
ALTER TABLE geo_cache ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

-- The home page copy still carried an earlier working name ("GiveBack").
UPDATE public_pages
   SET title = 'Volunteer Services — where volunteering meets real needs',
       body  = replace(body, 'GiveBack', 'Volunteer Services'),
       updated_at = NOW()
 WHERE slug = 'home' AND title LIKE 'GiveBack%';
