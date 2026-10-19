-- Folders are flat categories. Their storage prefix is assigned on creation and
-- remains stable when the display name changes (e.g. restaurantes/).
CREATE TABLE gallery_folders (
	id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
	name TEXT NOT NULL COLLATE NOCASE UNIQUE CHECK (length(trim(name)) BETWEEN 1 AND 100),
	storage_prefix TEXT NOT NULL UNIQUE CHECK (
		length(storage_prefix) BETWEEN 1 AND 100
		AND storage_prefix NOT GLOB '*[^a-z0-9-]*'
		AND substr(storage_prefix, 1, 1) GLOB '[a-z0-9]'
		AND substr(storage_prefix, -1, 1) GLOB '[a-z0-9]'
	),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Files belong to one folder. Generate the UUID in the application and store
-- the R2 key as <storage_prefix>/<image_uuid>.<extension> (not the original name).
-- Do not store signed URLs: they expire. Resolve object_key when serving a file.
CREATE TABLE gallery_images (
	id TEXT PRIMARY KEY NOT NULL CHECK (length(trim(id)) > 0),
	folder_id TEXT NOT NULL REFERENCES gallery_folders(id) ON DELETE RESTRICT,
	name TEXT NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
	object_key TEXT NOT NULL UNIQUE CHECK (length(trim(object_key)) > 0),
	original_filename TEXT NOT NULL CHECK (length(trim(original_filename)) > 0),
	content_type TEXT NOT NULL CHECK (content_type IN ('image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif')),
	size_bytes INTEGER NOT NULL CHECK (size_bytes > 0),
	created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
	updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX gallery_images_folder_created_idx ON gallery_images(folder_id, created_at DESC, id);
