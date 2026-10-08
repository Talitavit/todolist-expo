export type Category = {
  id: number;
  name: string;
  /** Hex color used for the category badge. */
  color: string;
};

export type CategoryWithCount = Category & {
  taskCount: number;
};

export type Task = {
  id: number;
  title: string;
  description: string | null;
  completed: boolean;
  /** Due date/time as epoch milliseconds, or null when the task has no deadline. */
  dueDateTime: number | null;
  /** Creation timestamp as epoch milliseconds. */
  createdAt: number;
  /** Last modification timestamp as epoch milliseconds. */
  updatedAt: number;
  categoryId: number | null;
  /** Identifier returned by expo-notifications for the scheduled reminder, if any. */
  notificationId: string | null;
};

export type TaskWithCategory = Task & {
  categoryName: string | null;
  categoryColor: string | null;
};

/** Fields the user can edit in the task editor. */
export type TaskInput = {
  title: string;
  description: string | null;
  completed: boolean;
  dueDateTime: number | null;
  categoryId: number | null;
};

export type StatusFilter = 'all' | 'pending' | 'completed';

/** 'all' = no category filter, 'none' = only uncategorized tasks, number = a category id. */
export type CategoryFilter = 'all' | 'none' | number;

/** Thrown for user-input problems; the message is safe to show in the UI. */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}
