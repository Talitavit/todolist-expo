import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Chip } from '@/components/Chip';
import { DueDateField } from '@/components/DueDateField';
import { listCategories } from '@/db/categories';
import { getTask } from '@/db/tasks';
import type { ReminderOutcome } from '@/notifications/reminders';
import { createTask, deleteTask, saveTask } from '@/services/taskService';
import { colors, spacing } from '@/theme';
import { type Category, type TaskInput, ValidationError } from '@/types';
import { errorMessage } from '@/utils/format';

const EMPTY_FORM: TaskInput = {
  title: '',
  description: '',
  completed: false,
  dueDateTime: null,
  categoryId: null,
};

/**
 * Create/edit screen. Route param `id` is either "new" or a task id; only the id
 * is passed through navigation and the task is re-read from SQLite here.
 */
export default function TaskEditorScreen() {
  const db = useSQLiteContext();
  const { id } = useLocalSearchParams<{ id: string }>();
  const isNew = id === 'new';
  const taskId = isNew ? null : Number(id);

  const [form, setForm] = useState<TaskInput>(EMPTY_FORM);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saving, setSaving] = useState(false);
  const [titleError, setTitleError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loadedCategories = await listCategories(db);
        const task = taskId !== null && Number.isInteger(taskId) ? await getTask(db, taskId) : null;
        if (cancelled) {
          return;
        }
        setCategories(loadedCategories);
        if (!isNew) {
          if (task) {
            setForm({
              title: task.title,
              description: task.description ?? '',
              completed: task.completed,
              dueDateTime: task.dueDateTime,
              categoryId: task.categoryId,
            });
          } else {
            setNotFound(true);
          }
        }
      } catch (error) {
        Alert.alert('Could not load task', errorMessage(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [db, isNew, taskId]);

  const update = <K extends keyof TaskInput>(key: K, value: TaskInput[K]) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const handleSave = async () => {
    if (form.title.trim().length === 0) {
      setTitleError('Title is required.');
      return;
    }
    setSaving(true);
    try {
      const result =
        taskId === null ? await createTask(db, form) : await saveTask(db, taskId, form);
      const warning = reminderWarning(result.reminder);
      if (warning) {
        Alert.alert('Task saved', warning, [{ text: 'OK', onPress: () => router.back() }]);
      } else {
        router.back();
      }
    } catch (error) {
      if (error instanceof ValidationError) {
        setTitleError(error.message);
      } else {
        Alert.alert('Could not save task', errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = () => {
    if (taskId === null) {
      return;
    }
    Alert.alert('Delete task?', `"${form.title}" will be permanently deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteTask(db, taskId);
            router.back();
          } catch (error) {
            Alert.alert('Could not delete task', errorMessage(error));
          }
        },
      },
    ]);
  };

  const title = isNew ? 'New Task' : 'Edit Task';

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (notFound) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title }} />
        <Text style={styles.muted}>This task no longer exists.</Text>
        <Pressable style={[styles.button, styles.secondary]} onPress={() => router.back()}>
          <Text style={styles.secondaryText}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <Stack.Screen options={{ title }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Title *</Text>
        <TextInput
          testID="title-input"
          value={form.title}
          onChangeText={(text) => {
            update('title', text);
            if (titleError) {
              setTitleError(null);
            }
          }}
          placeholder="What needs to be done?"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, titleError ? styles.inputError : null]}
          maxLength={120}
          autoFocus={isNew}
          returnKeyType="next"
        />
        {titleError ? <Text style={styles.errorText}>{titleError}</Text> : null}

        <Text style={styles.label}>Description</Text>
        <TextInput
          testID="description-input"
          value={form.description ?? ''}
          onChangeText={(text) => update('description', text)}
          placeholder="Optional details"
          placeholderTextColor={colors.textMuted}
          style={[styles.input, styles.multiline]}
          multiline
          textAlignVertical="top"
        />

        <Text style={styles.label}>Category</Text>
        <View style={styles.chipWrap}>
          <Chip
            label="None"
            selected={form.categoryId === null}
            onPress={() => update('categoryId', null)}
          />
          {categories.map((category) => (
            <Chip
              key={category.id}
              label={category.name}
              color={category.color}
              selected={form.categoryId === category.id}
              onPress={() => update('categoryId', category.id)}
            />
          ))}
        </View>
        <Pressable onPress={() => router.push('/categories')} hitSlop={8}>
          <Text style={styles.link}>Manage categories</Text>
        </Pressable>

        <Text style={styles.label}>Due date & time</Text>
        <DueDateField value={form.dueDateTime} onChange={(value) => update('dueDateTime', value)} />

        <View style={styles.switchRow}>
          <Text style={styles.switchLabel}>Completed</Text>
          <Switch
            testID="completed-switch"
            value={form.completed}
            onValueChange={(value) => update('completed', value)}
            trackColor={{ true: colors.success, false: colors.border }}
          />
        </View>

        <Pressable
          testID="save-task"
          style={[styles.button, styles.primary, saving && styles.disabled]}
          onPress={handleSave}
          disabled={saving}
        >
          <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Save'}</Text>
        </Pressable>

        <Pressable
          testID="cancel-task"
          style={[styles.button, styles.secondary]}
          onPress={() => router.back()}
          disabled={saving}
        >
          <Text style={styles.secondaryText}>Cancel</Text>
        </Pressable>

        {!isNew ? (
          <Pressable
            testID="delete-task"
            style={[styles.button, styles.danger]}
            onPress={handleDelete}
            disabled={saving}
          >
            <Text style={styles.dangerText}>Delete task</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

/** Message shown after saving when a reminder could not be scheduled. */
function reminderWarning(outcome: ReminderOutcome): string | null {
  switch (outcome.status) {
    case 'permission-denied':
      return 'Notifications are not allowed, so no reminder will be shown for this task. You can enable notifications for this app in the system settings.';
    case 'error':
      return `The reminder could not be scheduled: ${outcome.message}`;
    default:
      return null;
  }
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 16,
    color: colors.text,
  },
  inputError: {
    borderColor: colors.danger,
  },
  multiline: {
    minHeight: 96,
  },
  errorText: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: spacing.sm,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
    marginTop: spacing.sm,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  switchLabel: {
    fontSize: 16,
    color: colors.text,
  },
  button: {
    marginTop: spacing.md,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primary: {
    marginTop: spacing.xl,
    backgroundColor: colors.primary,
  },
  primaryText: {
    color: colors.primaryText,
    fontWeight: '700',
    fontSize: 16,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  secondaryText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 16,
  },
  danger: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  dangerText: {
    color: colors.danger,
    fontWeight: '700',
    fontSize: 16,
  },
  disabled: {
    opacity: 0.6,
  },
  muted: {
    color: colors.textMuted,
    fontSize: 15,
  },
});
