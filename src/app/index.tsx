import { router, Stack, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Chip } from '@/components/Chip';
import { TaskItem } from '@/components/TaskItem';
import { listCategories } from '@/db/categories';
import { listTasks } from '@/db/tasks';
import { useNow } from '@/hooks/useNow';
import { toggleTaskCompleted } from '@/services/taskService';
import { colors, spacing } from '@/theme';
import type { Category, CategoryFilter, StatusFilter, TaskWithCategory } from '@/types';
import { errorMessage } from '@/utils/format';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending', label: 'Pending' },
  { value: 'completed', label: 'Completed' },
];

export default function TaskListScreen() {
  const db = useSQLiteContext();
  const insets = useSafeAreaInsets();
  const now = useNow();

  const [status, setStatus] = useState<StatusFilter>('all');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [tasks, setTasks] = useState<TaskWithCategory[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const loadedCategories = await listCategories(db);
      // The selected category may have been deleted on the Categories screen.
      const effectiveCategory =
        typeof category === 'number' && !loadedCategories.some((c) => c.id === category)
          ? 'all'
          : category;
      if (effectiveCategory !== category) {
        setCategory(effectiveCategory);
      }
      setCategories(loadedCategories);
      setTasks(await listTasks(db, status, effectiveCategory));
      setLoadError(null);
    } catch (error) {
      console.error('[tasks] Failed to load', error);
      setLoadError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [db, status, category]);

  // Reloads when the screen regains focus (after editing) and when a filter changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleToggle = async (task: TaskWithCategory) => {
    try {
      await toggleTaskCompleted(db, task.id, !task.completed);
      await load();
    } catch (error) {
      Alert.alert('Could not update task', errorMessage(error));
    }
  };

  const emptyMessage =
    status === 'all' && category === 'all'
      ? 'No tasks yet. Tap + to create your first task.'
      : 'No tasks match the selected filters.';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable
              testID="open-categories"
              onPress={() => router.push('/categories')}
              hitSlop={8}
            >
              <Text style={styles.headerLink}>Categories</Text>
            </Pressable>
          ),
        }}
      />

      <View style={styles.filters}>
        <View style={styles.segmented}>
          {STATUS_OPTIONS.map((option) => (
            <Pressable
              key={option.value}
              testID={`status-${option.value}`}
              onPress={() => setStatus(option.value)}
              style={[styles.segment, status === option.value && styles.segmentSelected]}
              accessibilityRole="button"
              accessibilityState={{ selected: status === option.value }}
            >
              <Text
                style={[styles.segmentText, status === option.value && styles.segmentTextSelected]}
              >
                {option.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          <Chip label="All categories" selected={category === 'all'} onPress={() => setCategory('all')} />
          {categories.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={c.color}
              selected={category === c.id}
              onPress={() => setCategory(c.id)}
            />
          ))}
          <Chip
            label="Uncategorized"
            selected={category === 'none'}
            onPress={() => setCategory('none')}
          />
        </ScrollView>
      </View>

      {loading ? (
        <ActivityIndicator style={styles.loader} color={colors.primary} />
      ) : loadError ? (
        <View style={styles.empty}>
          <Text style={styles.errorText}>Could not load tasks: {loadError}</Text>
          <Pressable onPress={load} style={styles.retry}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={tasks}
          keyExtractor={(task) => String(task.id)}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 96 }]}
          renderItem={({ item }) => (
            <TaskItem
              task={item}
              now={now}
              onPress={() =>
                router.push({ pathname: '/task/[id]', params: { id: String(item.id) } })
              }
              onToggle={() => handleToggle(item)}
            />
          )}
          ListEmptyComponent={<Text style={styles.emptyText}>{emptyMessage}</Text>}
        />
      )}

      <Pressable
        testID="add-task"
        accessibilityRole="button"
        accessibilityLabel="Create task"
        onPress={() => router.push({ pathname: '/task/[id]', params: { id: 'new' } })}
        style={({ pressed }) => [
          styles.fab,
          { bottom: insets.bottom + spacing.xl },
          pressed && styles.fabPressed,
        ]}
      >
        <Text style={styles.fabText}>+</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerLink: {
    color: colors.primary,
    fontSize: 16,
    fontWeight: '600',
  },
  filters: {
    paddingTop: spacing.md,
    backgroundColor: colors.background,
  },
  segmented: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    backgroundColor: colors.border,
    borderRadius: 10,
    padding: 3,
  },
  segment: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: 8,
  },
  segmentSelected: {
    backgroundColor: colors.surface,
  },
  segmentText: {
    color: colors.textMuted,
    fontWeight: '600',
  },
  segmentTextSelected: {
    color: colors.text,
  },
  chips: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  list: {
    paddingHorizontal: spacing.lg,
  },
  loader: {
    marginTop: spacing.xl,
  },
  empty: {
    alignItems: 'center',
    padding: spacing.xl,
  },
  emptyText: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.xl,
    fontSize: 15,
  },
  errorText: {
    color: colors.danger,
    textAlign: 'center',
  },
  retry: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    backgroundColor: colors.primary,
  },
  retryText: {
    color: colors.primaryText,
    fontWeight: '600',
  },
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabPressed: {
    opacity: 0.8,
  },
  fabText: {
    color: colors.primaryText,
    fontSize: 32,
    lineHeight: 34,
    fontWeight: '400',
  },
});
