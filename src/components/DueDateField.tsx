import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useNow } from '@/hooks/useNow';
import { colors, spacing } from '@/theme';
import { formatDate, formatTime } from '@/utils/format';

type Props = {
  /** Epoch milliseconds or null for "no due date". */
  value: number | null;
  onChange: (value: number | null) => void;
};

type PickerMode = 'date' | 'time';

/** Default suggestion when the user adds a due date: the next full hour. */
function nextFullHour(): number {
  const date = new Date();
  date.setHours(date.getHours() + 1, 0, 0, 0);
  return date.getTime();
}

/** Keeps the date part of `base` and the time part of `picked` (or vice versa). */
function merge(base: Date, picked: Date, mode: PickerMode): number {
  const result = new Date(base);
  if (mode === 'date') {
    result.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
  } else {
    result.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
  }
  return result.getTime();
}

export function DueDateField({ value, onChange }: Props) {
  const now = useNow();

  if (value === null) {
    return (
      <Pressable
        testID="add-due-date"
        style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
        onPress={() => onChange(nextFullHour())}
      >
        <Text style={styles.addButtonText}>+ Add due date & time</Text>
      </Pressable>
    );
  }

  const current = new Date(value);
  const isPast = value <= now;

  const handlePicked = (mode: PickerMode, picked: Date) => {
    onChange(merge(current, picked, mode));
  };

  // Android: use the imperative API. The declarative <DateTimePicker> re-opens (and resets)
  // the dialog whenever its callback props change identity, i.e. on every re-render.
  const openAndroidPicker = (mode: PickerMode) => {
    DateTimePickerAndroid.open({
      value: current,
      mode,
      onValueChange: (_, picked) => handlePicked(mode, picked),
    });
  };

  return (
    <View>
      {Platform.OS === 'ios' ? (
        <View style={styles.row}>
          <DateTimePicker
            value={current}
            mode="date"
            display="compact"
            onValueChange={(_, picked) => handlePicked('date', picked)}
          />
          <DateTimePicker
            value={current}
            mode="time"
            display="compact"
            onValueChange={(_, picked) => handlePicked('time', picked)}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            testID="pick-date"
            style={({ pressed }) => [styles.valueButton, pressed && styles.pressed]}
            onPress={() => openAndroidPicker('date')}
          >
            <Text style={styles.valueLabel}>Date</Text>
            <Text style={styles.valueText}>{formatDate(current)}</Text>
          </Pressable>
          <Pressable
            testID="pick-time"
            style={({ pressed }) => [styles.valueButton, pressed && styles.pressed]}
            onPress={() => openAndroidPicker('time')}
          >
            <Text style={styles.valueLabel}>Time</Text>
            <Text style={styles.valueText}>{formatTime(current)}</Text>
          </Pressable>
        </View>
      )}

      {isPast ? (
        <Text style={styles.warning}>
          This date/time is in the past — no reminder will be scheduled.
        </Text>
      ) : null}

      <Pressable testID="remove-due-date" onPress={() => onChange(null)} hitSlop={8}>
        <Text style={styles.removeText}>Remove due date</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  addButton: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.primary,
    borderRadius: 10,
    padding: spacing.md,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.primary,
    fontWeight: '600',
  },
  valueButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 10,
    padding: spacing.md,
  },
  valueLabel: {
    fontSize: 12,
    color: colors.textMuted,
  },
  valueText: {
    fontSize: 15,
    color: colors.text,
    fontWeight: '600',
    marginTop: 2,
  },
  pressed: {
    opacity: 0.7,
  },
  warning: {
    marginTop: spacing.sm,
    color: colors.warning,
    fontSize: 13,
  },
  removeText: {
    marginTop: spacing.sm,
    color: colors.danger,
    fontWeight: '600',
  },
});
