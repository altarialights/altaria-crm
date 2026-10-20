-- One permanent link per physical card. Releasing a card keeps its identity.
CREATE TABLE cards (
	id TEXT PRIMARY KEY NOT NULL,
	reference TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(reference)) BETWEEN 1 AND 100),
	public_url TEXT NOT NULL UNIQUE,
	client_name TEXT NOT NULL DEFAULT '' CHECK (length(client_name) <= 200),
	target_url TEXT NOT NULL DEFAULT '' CHECK (length(target_url) <= 2048),
	design_id TEXT REFERENCES gallery_images(id) ON DELETE SET NULL,
	status TEXT NOT NULL DEFAULT 'free' CHECK (status IN ('free', 'active', 'paused')),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	CHECK ((status = 'free' AND client_name = '' AND target_url = '') OR
		(status IN ('active', 'paused') AND length(trim(client_name)) > 0 AND length(trim(target_url)) > 0))
);
CREATE INDEX cards_status_created_idx ON cards(status, created_at DESC, id);
CREATE INDEX cards_design_idx ON cards(design_id);
