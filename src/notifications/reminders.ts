import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import type { Task } from '@/types';

export const REMINDER_CHANNEL_ID = 'task-reminders';

export type ReminderPermission = 'granted' | 'denied' | 'unavailable';

/** Result of trying to (re)schedule a reminder for one task. */
export type ReminderOutcome =
  | { status: 'scheduled'; notificationId: string }
  | { status: 'not-needed' } // no due date, completed, or due date in the past
  | { status: 'permission-denied' }
  | { status: 'error'; message: string };

/** Show reminders as a banner even when the app is in the foreground. */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

/** Android 8+ needs a channel; on Android 13+ it must exist before the permission prompt. */
export async function ensureReminderChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }
  try {
    await Notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
      name: 'Task reminders',
      description: 'Reminders when a task reaches its due date',
      importance: Notifications.AndroidImportance.HIGH,
    });
  } catch (error) {
    console.warn('[reminders] Failed to create notification channel', error);
  }
}

function isGranted(settings: Notifications.NotificationPermissionsStatus): boolean {
  return (
    settings.granted ||
    settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL
  );
}

/** Reads the current permission without prompting the user. */
export async function getReminderPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }
  try {
    return isGranted(await Notifications.getPermissionsAsync()) ? 'granted' : 'denied';
  } catch (error) {
    console.warn('[reminders] Failed to read notification permission', error);
    return 'unavailable';
  }
}

/**
 * Asks for permission only if it was not granted yet and the OS still allows asking.
 * Never throws: a denial simply means reminders are skipped.
 */
export async function requestReminderPermission(): Promise<ReminderPermission> {
  if (Platform.OS === 'web') {
    return 'unavailable';
  }
  try {
    await ensureReminderChannel();
    const current = await Notifications.getPermissionsAsync();
    if (isGranted(current)) {
      return 'granted';
    }
    if (!current.canAskAgain) {
      return 'denied';
    }
    const requested = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: false, allowSound: true },
    });
    return isGranted(requested) ? 'granted' : 'denied';
  } catch (error) {
    console.warn('[reminders] Failed to request notification permission', error);
    return 'unavailable';
  }
}

export function needsReminder(task: Pick<Task, 'completed' | 'dueDateTime'>, now = Date.now()): boolean {
  return !task.completed && task.dueDateTime !== null && task.dueDateTime > now;
}

/**
 * Schedules a one-shot local notification at the task's due date/time.
 * The caller is responsible for cancelling any previous reminder first.
 */
export async function scheduleTaskReminder(
  task: Pick<Task, 'id' | 'title' | 'completed' | 'dueDateTime'>,
  options: { askPermission: boolean },
): Promise<ReminderOutcome> {
  if (!needsReminder(task) || task.dueDateTime === null) {
    return { status: 'not-needed' };
  }

  const permission = options.askPermission
    ? await requestReminderPermission()
    : await getReminderPermission();
  if (permission !== 'granted') {
    return { status: 'permission-denied' };
  }

  try {
    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Task reminder',
        body: task.title,
        data: { taskId: task.id },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: new Date(task.dueDateTime),
        channelId: REMINDER_CHANNEL_ID,
      },
    });
    return { status: 'scheduled', notificationId };
  } catch (error) {
    console.warn('[reminders] Failed to schedule reminder', error);
    return { status: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

/** Cancels a scheduled reminder. Never throws (the reminder may already have fired). */
export async function cancelTaskReminder(notificationId: string | null): Promise<void> {
  if (!notificationId || Platform.OS === 'web') {
    return;
  }
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (error) {
    console.warn('[reminders] Failed to cancel reminder', notificationId, error);
  }
}

/** Identifiers of all reminders currently scheduled by the OS for this app. */
export async function getScheduledReminderIds(): Promise<Set<string>> {
  if (Platform.OS === 'web') {
    return new Set();
  }
  try {
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    return new Set(scheduled.map((request) => request.identifier));
  } catch (error) {
    console.warn('[reminders] Failed to list scheduled reminders', error);
    return new Set();
  }
}
