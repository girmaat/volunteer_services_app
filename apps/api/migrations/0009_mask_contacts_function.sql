-- Same masking as the messaging layer, for application messages shown to organizers before acceptance.
CREATE OR REPLACE FUNCTION mask_contacts(t TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE WHEN t IS NULL THEN NULL ELSE
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(t, '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}', '[contact details hidden until accepted]', 'g'),
        '(https?://|www\.)[^\s<>"]+', '[link hidden until accepted]', 'gi'),
      '\m[a-z0-9-]{2,}\.(com|org|net|io|co|me|app|ly|gg|info|biz|us|link|site|xyz)\M(/[^\s<>"]*)?', '[link hidden until accepted]', 'gi'),
    '\+?\d[\d\s().-]{5,}\d', '[contact details hidden until accepted]', 'g')
  END
$$;
