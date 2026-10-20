CREATE TABLE clients (
	id TEXT PRIMARY KEY NOT NULL,
	name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
	company TEXT NOT NULL DEFAULT '' CHECK (length(company) <= 200),
	email TEXT NOT NULL DEFAULT '' CHECK (length(email) <= 254),
	phone TEXT NOT NULL DEFAULT '' CHECK (length(phone) <= 50),
	website TEXT NOT NULL DEFAULT '' CHECK (length(website) <= 2048),
	notes TEXT NOT NULL DEFAULT '' CHECK (length(notes) <= 5000),
	stage TEXT NOT NULL DEFAULT 'uncontacted' CHECK (stage IN ('uncontacted','first_contact','meeting_scheduled','quote_sent','quote_accepted','project_started','project_finished')),
	position REAL NOT NULL DEFAULT 1024,
	version INTEGER NOT NULL DEFAULT 0 CHECK (version >= 0),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE INDEX clients_stage_position_idx ON clients(stage, position, id);
CREATE INDEX clients_name_idx ON clients(name COLLATE NOCASE, id);

-- Existing text assignments remain valid until linked to a client explicitly.
ALTER TABLE cards ADD COLUMN client_id TEXT REFERENCES clients(id) ON DELETE RESTRICT;
CREATE INDEX cards_client_idx ON cards(client_id);
