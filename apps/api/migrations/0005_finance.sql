CREATE TABLE finance_categories (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
  name TEXT NOT NULL COLLATE NOCASE CHECK(length(trim(name)) BETWEEN 1 AND 100),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  UNIQUE(kind, name)
);

CREATE TABLE finance_series (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
  concept TEXT NOT NULL CHECK(length(trim(concept)) BETWEEN 1 AND 200),
  amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 9999999999),
  category_id TEXT REFERENCES finance_categories(id) ON DELETE RESTRICT,
  client_id TEXT REFERENCES clients(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 5000),
  frequency TEXT NOT NULL CHECK(frequency IN ('monthly', 'quarterly', 'yearly')),
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  anchor_day INTEGER NOT NULL CHECK(anchor_day BETWEEN 1 AND 31),
  last_due_on TEXT NOT NULL,
  next_due_on TEXT NOT NULL,
  next_index INTEGER NOT NULL DEFAULT 1 CHECK(next_index >= 1),
  active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(ends_on IS NULL OR ends_on >= starts_on),
  CHECK(next_due_on > last_due_on)
);

CREATE TABLE finance_entries (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('income', 'expense')),
  concept TEXT NOT NULL CHECK(length(trim(concept)) BETWEEN 1 AND 200),
  amount_cents INTEGER NOT NULL CHECK(typeof(amount_cents) = 'integer' AND amount_cents BETWEEN 1 AND 9999999999),
  category_id TEXT REFERENCES finance_categories(id) ON DELETE RESTRICT,
  client_id TEXT REFERENCES clients(id) ON DELETE RESTRICT,
  notes TEXT NOT NULL DEFAULT '' CHECK(length(notes) <= 5000),
  due_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'settled')),
  paid_on TEXT,
  series_id TEXT REFERENCES finance_series(id) ON DELETE RESTRICT,
  occurrence_index INTEGER,
  attachment_key TEXT UNIQUE,
  attachment_name TEXT,
  attachment_type TEXT,
  attachment_size INTEGER,
  deleted_at TEXT,
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(series_id, occurrence_index),
  CHECK((series_id IS NULL AND occurrence_index IS NULL) OR (series_id IS NOT NULL AND occurrence_index IS NOT NULL AND occurrence_index >= 0)),
  CHECK((status = 'pending' AND paid_on IS NULL) OR (status = 'settled' AND paid_on IS NOT NULL)),
  CHECK((attachment_key IS NULL AND attachment_name IS NULL AND attachment_type IS NULL AND attachment_size IS NULL)
    OR (attachment_key IS NOT NULL AND attachment_name IS NOT NULL AND attachment_type IS NOT NULL
      AND attachment_type IN ('application/pdf','image/png','image/jpeg','image/webp','image/gif','image/avif')
      AND attachment_size IS NOT NULL AND attachment_size BETWEEN 1 AND 10485760))
);

CREATE INDEX finance_entries_list_idx ON finance_entries(kind, due_on DESC, id) WHERE deleted_at IS NULL;
CREATE INDEX finance_entries_client_idx ON finance_entries(client_id);
CREATE INDEX finance_series_due_idx ON finance_series(active, next_due_on);
CREATE INDEX finance_series_client_idx ON finance_series(client_id);

INSERT INTO finance_categories(id,kind,name) VALUES
 ('72a56aab-8535-44ca-b793-dbb4eeab0001','income','Servicios'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0002','income','Impresión'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0003','income','Venta de productos'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0004','income','Otros'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0005','expense','Materiales'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0006','expense','Software'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0007','expense','Hosting'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0008','expense','Servicios'),
 ('72a56aab-8535-44ca-b793-dbb4eeab0009','expense','Otros');
