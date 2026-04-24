export const SCHEMA_VERSION = 1;

export const schemaStatements = [
  `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL,
    display_name TEXT,
    avatar_url TEXT,
    instance_url TEXT NOT NULL,
    access_token TEXT,
    refresh_token TEXT,
    token_expiry TEXT,
    proxy_session TEXT,
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    sort_title TEXT,
    subtitle TEXT,
    description TEXT,
    first_published TEXT,
    subjects TEXT,
    series_name TEXT,
    series_number TEXT,
    openlibrary_key TEXT,
    wikidata_id TEXT,
    last_fetched TEXT,
    source_instance TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS editions (
    id TEXT PRIMARY KEY,
    work_id TEXT,
    title TEXT NOT NULL,
    subtitle TEXT,
    description TEXT,
    isbn_13 TEXT,
    isbn_10 TEXT,
    asin TEXT,
    oclc_number TEXT,
    pages INTEGER,
    physical_format TEXT,
    publishers TEXT,
    published_date TEXT,
    languages TEXT,
    cover_url TEXT,
    cover_cached INTEGER DEFAULT 0,
    last_fetched TEXT,
    source_instance TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_editions_work ON editions(work_id)`,
  `CREATE INDEX IF NOT EXISTS idx_editions_isbn13 ON editions(isbn_13)`,
  `CREATE TABLE IF NOT EXISTS authors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_name TEXT,
    bio TEXT,
    born TEXT,
    died TEXT,
    wikipedia_url TEXT,
    openlibrary_key TEXT,
    wikidata_id TEXT,
    photo_url TEXT,
    last_fetched TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS edition_authors (
    edition_id TEXT NOT NULL,
    author_id TEXT NOT NULL,
    role TEXT DEFAULT 'author',
    sort_order INTEGER DEFAULT 0,
    PRIMARY KEY (edition_id, author_id, role)
  )`,
  `CREATE TABLE IF NOT EXISTS shelves (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    name TEXT NOT NULL,
    identifier TEXT NOT NULL,
    is_default INTEGER DEFAULT 0,
    privacy TEXT DEFAULT 'public',
    sort_order INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS shelf_books (
    shelf_id TEXT NOT NULL,
    edition_id TEXT NOT NULL,
    added_date TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (shelf_id, edition_id)
  )`,
  `CREATE TABLE IF NOT EXISTS reading_progress (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    edition_id TEXT NOT NULL,
    progress_type TEXT NOT NULL,
    progress REAL NOT NULL,
    started_date TEXT,
    finished_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS statuses (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    account_id TEXT NOT NULL,
    edition_id TEXT,
    title TEXT,
    content TEXT,
    content_text TEXT,
    quote_text TEXT,
    rating REAL,
    page_number INTEGER,
    privacy TEXT DEFAULT 'public',
    sensitive INTEGER DEFAULT 0,
    spoiler_text TEXT,
    in_reply_to TEXT,
    published TEXT NOT NULL,
    favourites_count INTEGER DEFAULT 0,
    replies_count INTEGER DEFAULT 0,
    boosts_count INTEGER DEFAULT 0,
    is_favourited INTEGER DEFAULT 0,
    is_boosted INTEGER DEFAULT 0,
    last_fetched TEXT,
    source_instance TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_statuses_account ON statuses(account_id, published DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_statuses_edition ON statuses(edition_id, published DESC)`,
  `CREATE TABLE IF NOT EXISTS timeline_entries (id TEXT PRIMARY KEY, timeline_type TEXT NOT NULL, status_id TEXT NOT NULL, activity_type TEXT NOT NULL, boosted_by TEXT, position TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  `CREATE INDEX IF NOT EXISTS idx_timeline_type ON timeline_entries(timeline_type, position DESC)`,
  `CREATE TABLE IF NOT EXISTS write_queue (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    operation TEXT NOT NULL,
    status TEXT DEFAULT 'pending',
    attempts INTEGER DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE INDEX IF NOT EXISTS idx_write_queue_status ON write_queue(status, created_at)`,
  `CREATE TABLE IF NOT EXISTS entity_resolution (
    uri TEXT PRIMARY KEY,
    entity_type TEXT NOT NULL,
    state TEXT DEFAULT 'stub',
    unresolved TEXT,
    last_attempt TEXT,
    error_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TRIGGER IF NOT EXISTS accounts_updated_at
    AFTER UPDATE ON accounts
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE accounts SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS works_updated_at
    AFTER UPDATE ON works
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE works SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS editions_updated_at
    AFTER UPDATE ON editions
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE editions SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS authors_updated_at
    AFTER UPDATE ON authors
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE authors SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS shelves_updated_at
    AFTER UPDATE ON shelves
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE shelves SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS statuses_updated_at
    AFTER UPDATE ON statuses
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE statuses SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS write_queue_updated_at
    AFTER UPDATE ON write_queue
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE write_queue SET updated_at = datetime('now') WHERE id = OLD.id;
    END`,
  `CREATE TRIGGER IF NOT EXISTS entity_resolution_updated_at
    AFTER UPDATE ON entity_resolution
    FOR EACH ROW
    WHEN NEW.updated_at = OLD.updated_at
    BEGIN
      UPDATE entity_resolution SET updated_at = datetime('now') WHERE uri = OLD.uri;
    END`,
  `CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(title, author_names, isbn, content, tokenize='porter unicode61')`
] as const;
