ALTER TABLE clients ADD COLUMN logo_key TEXT;
ALTER TABLE clients ADD COLUMN logo_content_type TEXT;
ALTER TABLE clients ADD COLUMN logo_size_bytes INTEGER CHECK (
  (logo_key IS NULL AND logo_content_type IS NULL AND logo_size_bytes IS NULL)
  OR (logo_key IS NOT NULL AND length(logo_key) > 0
    AND logo_content_type IS NOT NULL AND logo_content_type IN ('image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/avif')
    AND logo_size_bytes IS NOT NULL AND logo_size_bytes BETWEEN 1 AND 10485760)
);
CREATE UNIQUE INDEX clients_logo_key_idx ON clients(logo_key) WHERE logo_key IS NOT NULL;
