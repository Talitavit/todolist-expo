import type { SQLiteDatabase } from 'expo-sqlite';

import { type Category, type CategoryWithCount, ValidationError } from '@/types';

export const CATEGORY_COLORS = [
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#059669',
  '#DC2626',
  '#DB2777',
  '#0891B2',
  '#64748B',
];

const MAX_NAME_LENGTH = 40;

function validateName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    throw new ValidationError('Category name is required.');
  }
  if (trimmed.length > MAX_NAME_LENGTH) {
    throw new ValidationError(`Category name must be at most ${MAX_NAME_LENGTH} characters.`);
  }
  return trimmed;
}

/** Converts SQLite UNIQUE violations into a user-friendly ValidationError. */
function rethrowUnique(error: unknown, name: string): never {
  if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
    throw new ValidationError(`A category named "${name}" already exists.`);
  }
  throw error;
}

export async function listCategories(db: SQLiteDatabase): Promise<Category[]> {
  return db.getAllAsync<Category>(
    'SELECT id, name, color FROM categories ORDER BY name COLLATE NOCASE',
  );
}

export async function listCategoriesWithCounts(db: SQLiteDatabase): Promise<CategoryWithCount[]> {
  return db.getAllAsync<CategoryWithCount>(`
    SELECT c.id, c.name, c.color, COUNT(t.id) AS taskCount
    FROM categories c
    LEFT JOIN tasks t ON t.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name COLLATE NOCASE
  `);
}

export async function createCategory(
  db: SQLiteDatabase,
  name: string,
  color: string,
): Promise<number> {
  const validName = validateName(name);
  try {
    const result = await db.runAsync(
      'INSERT INTO categories (name, color) VALUES (?, ?)',
      validName,
      color,
    );
    return result.lastInsertRowId;
  } catch (error) {
    rethrowUnique(error, validName);
  }
}

export async function updateCategory(
  db: SQLiteDatabase,
  id: number,
  name: string,
  color: string,
): Promise<void> {
  const validName = validateName(name);
  try {
    await db.runAsync(
      'UPDATE categories SET name = ?, color = ? WHERE id = ?',
      validName,
      color,
      id,
    );
  } catch (error) {
    rethrowUnique(error, validName);
  }
}

/**
 * Deletes a category. Tasks that used it become uncategorized (category_id = NULL).
 * The explicit UPDATE duplicates the ON DELETE SET NULL foreign key so the behavior
 * holds even if foreign key enforcement were off for this connection.
 * Returns how many tasks were uncategorized.
 */
export async function deleteCategory(db: SQLiteDatabase, id: number): Promise<number> {
  let affected = 0;
  await db.withTransactionAsync(async () => {
    const result = await db.runAsync('UPDATE tasks SET category_id = NULL WHERE category_id = ?', id);
    affected = result.changes;
    await db.runAsync('DELETE FROM categories WHERE id = ?', id);
  });
  return affected;
}
