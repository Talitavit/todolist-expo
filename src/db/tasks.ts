import type { SQLiteBindValue, SQLiteDatabase } from 'expo-sqlite';

import {
  type CategoryFilter,
  type StatusFilter,
  type Task,
  type TaskInput,
  type TaskWithCategory,
  ValidationError,
} from '@/types';

const MAX_TITLE_LENGTH = 120;

type TaskRow = {
  id: number;
  title: string;
  description: string | null;
  completed: number;
  due_date_time: number | null;
  created_at: number;
  updated_at: number;
  category_id: number | null;
  notification_id: string | null;
};

type TaskWithCategoryRow = TaskRow & {
  category_name: string | null;
  category_color: string | null;
};

function mapTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: row.completed === 1,
    dueDateTime: row.due_date_time,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    categoryId: row.category_id,
    notificationId: row.notification_id,
  };
}

function mapTaskWithCategory(row: TaskWithCategoryRow): TaskWithCategory {
  return {
    ...mapTask(row),
    categoryName: row.category_name,
    categoryColor: row.category_color,
  };
}

/** Normalizes and validates editor input before it reaches SQLite. */
export function validateTaskInput(input: TaskInput): TaskInput {
  const title = input.title.trim();
  if (title.length === 0) {
    throw new ValidationError('Title is required.');
  }
  if (title.length > MAX_TITLE_LENGTH) {
    throw new ValidationError(`Title must be at most ${MAX_TITLE_LENGTH} characters.`);
  }
  if (input.dueDateTime !== null && !Number.isFinite(input.dueDateTime)) {
    throw new ValidationError('Due date is invalid.');
  }
  const description = input.description?.trim() ?? '';
  return {
    ...input,
    title,
    description: description.length > 0 ? description : null,
  };
}

/** Filtering is done in SQL so only the matching rows are loaded. */
export async function listTasks(
  db: SQLiteDatabase,
  status: StatusFilter,
  category: CategoryFilter,
): Promise<TaskWithCategory[]> {
  const where: string[] = [];
  const params: SQLiteBindValue[] = [];

  if (status === 'pending') {
    where.push('t.completed = 0');
  } else if (status === 'completed') {
    where.push('t.completed = 1');
  }

  if (category === 'none') {
    where.push('t.category_id IS NULL');
  } else if (typeof category === 'number') {
    where.push('t.category_id = ?');
    params.push(category);
  }

  const whereClause = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

  // Pending first; then tasks with a due date (soonest first); then newest.
  const rows = await db.getAllAsync<TaskWithCategoryRow>(
    `SELECT t.*, c.name AS category_name, c.color AS category_color
     FROM tasks t
     LEFT JOIN categories c ON c.id = t.category_id
     ${whereClause}
     ORDER BY t.completed ASC,
              t.due_date_time IS NULL ASC,
              t.due_date_time ASC,
              t.created_at DESC`,
    params,
  );
  return rows.map(mapTaskWithCategory);
}

export async function getTask(db: SQLiteDatabase, id: number): Promise<Task | null> {
  const row = await db.getFirstAsync<TaskRow>('SELECT * FROM tasks WHERE id = ?', id);
  return row ? mapTask(row) : null;
}

export async function insertTask(db: SQLiteDatabase, input: TaskInput): Promise<number> {
  const valid = validateTaskInput(input);
  const now = Date.now();
  const result = await db.runAsync(
    `INSERT INTO tasks (title, description, completed, due_date_time, created_at, updated_at, category_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    valid.title,
    valid.description,
    valid.completed ? 1 : 0,
    valid.dueDateTime,
    now,
    now,
    valid.categoryId,
  );
  return result.lastInsertRowId;
}

export async function updateTask(db: SQLiteDatabase, id: number, input: TaskInput): Promise<void> {
  const valid = validateTaskInput(input);
  const result = await db.runAsync(
    `UPDATE tasks
     SET title = ?, description = ?, completed = ?, due_date_time = ?, category_id = ?, updated_at = ?
     WHERE id = ?`,
    valid.title,
    valid.description,
    valid.completed ? 1 : 0,
    valid.dueDateTime,
    valid.categoryId,
    Date.now(),
    id,
  );
  if (result.changes === 0) {
    throw new Error(`Task ${id} no longer exists.`);
  }
}

export async function setTaskCompleted(
  db: SQLiteDatabase,
  id: number,
  completed: boolean,
): Promise<void> {
  await db.runAsync(
    'UPDATE tasks SET completed = ?, updated_at = ? WHERE id = ?',
    completed ? 1 : 0,
    Date.now(),
    id,
  );
}

export async function setTaskNotificationId(
  db: SQLiteDatabase,
  id: number,
  notificationId: string | null,
): Promise<void> {
  await db.runAsync('UPDATE tasks SET notification_id = ? WHERE id = ?', notificationId, id);
}

export async function deleteTaskRow(db: SQLiteDatabase, id: number): Promise<void> {
  await db.runAsync('DELETE FROM tasks WHERE id = ?', id);
}

/** Pending tasks with a future due date; used to repair reminders at startup. */
export async function listTasksNeedingReminder(db: SQLiteDatabase): Promise<Task[]> {
  const rows = await db.getAllAsync<TaskRow>(
    'SELECT * FROM tasks WHERE completed = 0 AND due_date_time > ?',
    Date.now(),
  );
  return rows.map(mapTask);
}
