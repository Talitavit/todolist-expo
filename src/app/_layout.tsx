import * as Notifications from 'expo-notifications';
import { router, Stack } from 'expo-router';
import { SQLiteProvider, useSQLiteContext } from 'expo-sqlite';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { DATABASE_NAME, migrateDbIfNeeded } from '@/db/schema';
import { configureNotificationHandler, ensureReminderChannel } from '@/notifications/reminders';
import { repairReminders } from '@/services/taskService';
import { colors } from '@/theme';

configureNotificationHandler();

export default function RootLayout() {
  return (
    <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrateDbIfNeeded}>
      <StatusBar style="dark" />
      <ReminderSync />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="index" options={{ title: 'My Tasks' }} />
        <Stack.Screen name="task/[id]" options={{ title: 'Task' }} />
        <Stack.Screen name="categories" options={{ title: 'Categories' }} />
      </Stack>
    </SQLiteProvider>
  );
}

/**
 * Side effects that need the database but render nothing:
 * - creates the Android notification channel;
 * - re-schedules reminders that are missing (never prompts for permission);
 * - opens the task editor when the user taps a reminder notification.
 */
function ReminderSync() {
  const db = useSQLiteContext();
  const lastResponse = Notifications.useLastNotificationResponse();
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    (async () => {
      await ensureReminderChannel();
      try {
        const repaired = await repairReminders(db);
        if (repaired > 0) {
          console.log(`[reminders] Re-scheduled ${repaired} missing reminder(s)`);
        }
      } catch (error) {
        console.warn('[reminders] Startup repair failed', error);
      }
    })();
  }, [db]);

  useEffect(() => {
    if (!lastResponse) {
      return;
    }
    const request = lastResponse.notification.request;
    if (handledResponseId.current === request.identifier) {
      return;
    }
    handledResponseId.current = request.identifier;
    const taskId = request.content.data?.taskId;
    if (typeof taskId === 'number') {
      router.push({ pathname: '/task/[id]', params: { id: String(taskId) } });
    }
  }, [lastResponse]);

  return null;
}
