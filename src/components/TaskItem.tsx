import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@/theme';
import type { TaskWithCategory } from '@/types';
import { formatDateTime } from '@/utils/format';

type Props = {
  task: TaskWithCategory;
  /** Current time (epoch ms), used to flag overdue tasks. */
  now: number;
  onPress: () => void;
  onToggle: () => void;
};

export function TaskItem({ task, now, onPress, onToggle }: Props) {
  const overdue = !task.completed && task.dueDateTime !== null && task.dueDateTime < now;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`Open task ${task.title}`}
    >
      <Pressable
        onPress={onToggle}
        hitSlop={12}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: task.completed }}
        accessibilityLabel={task.completed ? 'Mark as pending' : 'Mark as completed'}
        style={[styles.checkbox, task.completed && styles.checkboxChecked]}
      >
        {task.completed ? <Text style={styles.checkmark}>✓</Text> : null}
      </Pressable>

      <View style={styles.body}>
        <Text style={[styles.title, task.completed && styles.titleCompleted]} numberOfLines={2}>
          {task.title}
        </Text>

        <View style={styles.meta}>
          <Text style={[styles.status, task.completed ? styles.statusDone : styles.statusPending]}>
            {task.completed ? 'Completed' : 'Pending'}
          </Text>

          {task.categoryName ? (
            <View style={[styles.badge, { borderColor: task.categoryColor ?? colors.border }]}>
              <View
                style={[styles.dot, { backgroundColor: task.categoryColor ?? colors.textMuted }]}
              />
              <Text style={styles.badgeText} numberOfLines={1}>
                {task.categoryName}
              </Text>
            </View>
          ) : null}
        </View>

        {task.dueDateTime !== null ? (
          <Text style={[styles.due, overdue && styles.overdue]}>
            {overdue ? 'Overdue · ' : 'Due '}
            {formatDateTime(task.dueDateTime)}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: spacing.sm,
  },
  pressed: {
    opacity: 0.75,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
    marginTop: 1,
  },
  checkboxChecked: {
    backgroundColor: colors.success,
    borderColor: colors.success,
  },
  checkmark: {
    color: colors.primaryText,
    fontSize: 15,
    fontWeight: '700',
  },
  body: {
    flex: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  titleCompleted: {
    textDecorationLine: 'line-through',
    color: colors.textMuted,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  status: {
    fontSize: 12,
    fontWeight: '600',
  },
  statusPending: {
    color: colors.warning,
  },
  statusDone: {
    color: colors.success,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    maxWidth: 160,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    marginRight: 4,
  },
  badgeText: {
    fontSize: 12,
    color: colors.text,
  },
  due: {
    marginTop: spacing.xs,
    fontSize: 13,
    color: colors.textMuted,
  },
  overdue: {
    color: colors.danger,
    fontWeight: '600',
  },
});
