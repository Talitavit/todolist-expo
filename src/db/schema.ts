import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'todo.db';

/** Bump this and add a migration step below whenever the schema changes. */
const DATABASE_VERSION = 1;

export const DEFAULT_CATEGORIES: { name: string; color: string }[] = [
  { name: 'Personal', color: '#2563EB' },
  { name: 'Work', color: '#D97706' },
  { name: 'Study', color: '#7C3AED' },
  { name: 'Shopping', color: '#059669' },
];

/**
 * Passed to <SQLiteProvider onInit>. Runs every time the database is opened.
 * Uses PRAGMA user_version to apply each schema migration exactly once.
 */
export async function migrateDbIfNeeded(db: SQLiteDatabase): Promise<void> {
  // foreign_keys is a per-connection setting, so it must be enabled on every open.
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;

      CREATE TABLE IF NOT EXISTS categories (
        id    INTEGER PRIMARY KEY AUTOINCREMENT,
        name  TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(trim(name)) > 0),
        color TEXT NOT NULL DEFAULT '#64748B'
      );

      CREATE TABLE IF NOT EXISTS tasks (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        title           TEXT NOT NULL CHECK (length(trim(title)) > 0),
        description     TEXT,
        completed       INTEGER NOT NULL DEFAULT 0 CHECK (completed IN (0, 1)),
        due_date_time   INTEGER,
        created_at      INTEGER NOT NULL,
        updated_at      INTEGER NOT NULL,
        category_id     INTEGER REFERENCES categories(id) ON DELETE SET NULL,
        notification_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_tasks_category_id ON tasks(category_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_completed ON tasks(completed);
    `);

    await db.withTransactionAsync(async () => {
      for (const category of DEFAULT_CATEGORIES) {
        await db.runAsync(
          'INSERT OR IGNORE INTO categories (name, color) VALUES (?, ?)',
          category.name,
          category.color,
        );
      }
    });
    currentVersion = 1;
  }

  // Future migrations go here, e.g. `if (currentVersion === 1) { ...; currentVersion = 2; }`

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
