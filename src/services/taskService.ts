import type { SQLiteDatabase } from 'expo-sqlite';

import {
  deleteTaskRow,
  getTask,
  insertTask,
  listTasksNeedingReminder,
  setTaskCompleted,
  setTaskNotificationId,
  updateTask,
} from '@/db/tasks';
import {
  cancelTaskReminder,
  getScheduledReminderIds,
  type ReminderOutcome,
  scheduleTaskReminder,
} from '@/notifications/reminders';
import type { Task, TaskInput } from '@/types';

/**
 * Task operations that touch both SQLite and scheduled notifications.
 * Screens call these instead of the raw repository functions so the stored
 * notification_id always matches what the OS has scheduled.
 *
 * Strategy: every write cancels the task's previous reminder (if any) and schedules
 * a fresh one when the task is pending with a future due date. This single rule
 * covers create, due-date change, due-date removal, complete and reopen.
 */

export type SaveResult = {
  taskId: number;
  reminder: ReminderOutcome;
};

async function syncReminder(
  db: SQLiteDatabase,
  task: Task,
  askPermission: boolean,
): Promise<ReminderOutcome> {
  await cancelTaskReminder(task.notificationId);
  const outcome = await scheduleTaskReminder(task, { askPermission });
  const newId = outcome.status === 'scheduled' ? outcome.notificationId : null;
  if (newId !== task.notificationId) {
    await setTaskNotificationId(db, task.id, newId);
  }
  return outcome;
}

async function requireTask(db: SQLiteDatabase, id: number): Promise<Task> {
  const task = await getTask(db, id);
  if (!task) {
    throw new Error(`Task ${id} was not found.`);
  }
  return task;
}

export async function createTask(db: SQLiteDatabase, input: TaskInput): Promise<SaveResult> {
  const taskId = await insertTask(db, input);
  const task = await requireTask(db, taskId);
  return { taskId, reminder: await syncReminder(db, task, true) };
}

export async function saveTask(
  db: SQLiteDatabase,
  id: number,
  input: TaskInput,
): Promise<SaveResult> {
  await updateTask(db, id, input);
  const task = await requireTask(db, id);
  return { taskId: id, reminder: await syncReminder(db, task, true) };
}

export async function toggleTaskCompleted(
  db: SQLiteDatabase,
  id: number,
  completed: boolean,
): Promise<SaveResult> {
  await setTaskCompleted(db, id, completed);
  const task = await requireTask(db, id);
  // Reopening from the list should not pop a permission dialog unexpectedly.
  return { taskId: id, reminder: await syncReminder(db, task, false) };
}

export async function deleteTask(db: SQLiteDatabase, id: number): Promise<void> {
  const task = await getTask(db, id);
  await deleteTaskRow(db, id);
  if (task) {
    await cancelTaskReminder(task.notificationId);
  }
}

/**
 * Startup repair: schedules reminders for pending future tasks whose reminder is
 * missing (e.g. permission was granted later, or the OS dropped it). Never prompts.
 */
export async function repairReminders(db: SQLiteDatabase): Promise<number> {
  const tasks = await listTasksNeedingReminder(db);
  if (tasks.length === 0) {
    return 0;
  }
  const scheduledIds = await getScheduledReminderIds();
  let repaired = 0;
  for (const task of tasks) {
    if (task.notificationId && scheduledIds.has(task.notificationId)) {
      continue;
    }
    const outcome = await syncReminder(db, task, false);
    if (outcome.status === 'scheduled') {
      repaired += 1;
    }
  }
  return repaired;
}
