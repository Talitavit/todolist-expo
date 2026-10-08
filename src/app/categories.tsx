import { useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  CATEGORY_COLORS,
  createCategory,
  deleteCategory,
  listCategoriesWithCounts,
  updateCategory,
} from '@/db/categories';
import { colors, spacing } from '@/theme';
import { type CategoryWithCount, ValidationError } from '@/types';
import { errorMessage } from '@/utils/format';

function ColorPicker({ value, onChange }: { value: string; onChange: (color: string) => void }) {
  return (
    <View style={styles.colors}>
      {CATEGORY_COLORS.map((color) => (
        <Pressable
          key={color}
          accessibilityRole="button"
          accessibilityLabel={`Color ${color}`}
          accessibilityState={{ selected: value === color }}
          onPress={() => onChange(color)}
          style={[
            styles.swatch,
            { backgroundColor: color },
            value === color && styles.swatchSelected,
          ]}
        />
      ))}
    </View>
  );
}

export default function CategoriesScreen() {
  const db = useSQLiteContext();
  const [categories, setCategories] = useState<CategoryWithCount[]>([]);

  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(CATEGORY_COLORS[0]);
  const [createError, setCreateError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState(CATEGORY_COLORS[0]);
  const [editError, setEditError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setCategories(await listCategoriesWithCounts(db));
    } catch (error) {
      Alert.alert('Could not load categories', errorMessage(error));
    }
  }, [db]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const handleCreate = async () => {
    try {
      await createCategory(db, newName, newColor);
      setNewName('');
      setCreateError(null);
      await load();
    } catch (error) {
      if (error instanceof ValidationError) {
        setCreateError(error.message);
      } else {
        Alert.alert('Could not create category', errorMessage(error));
      }
    }
  };

  const startEditing = (category: CategoryWithCount) => {
    setEditingId(category.id);
    setEditName(category.name);
    setEditColor(category.color);
    setEditError(null);
  };

  const handleRename = async () => {
    if (editingId === null) {
      return;
    }
    try {
      await updateCategory(db, editingId, editName, editColor);
      setEditingId(null);
      await load();
    } catch (error) {
      if (error instanceof ValidationError) {
        setEditError(error.message);
      } else {
        Alert.alert('Could not rename category', errorMessage(error));
      }
    }
  };

  const handleDelete = (category: CategoryWithCount) => {
    const usage =
      category.taskCount > 0
        ? `${category.taskCount} task(s) use this category. They will be kept and become uncategorized.`
        : 'No tasks use this category.';
    Alert.alert(`Delete "${category.name}"?`, usage, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteCategory(db, category.id);
            if (editingId === category.id) {
              setEditingId(null);
            }
            await load();
          } catch (error) {
            Alert.alert('Could not delete category', errorMessage(error));
          }
        },
      },
    ]);
  };

  const renderItem = ({ item }: { item: CategoryWithCount }) => {
    if (item.id === editingId) {
      return (
        <View style={styles.card}>
          <TextInput
            testID="rename-input"
            value={editName}
            onChangeText={(text) => {
              setEditName(text);
              setEditError(null);
            }}
            style={[styles.input, editError ? styles.inputError : null]}
            autoFocus
            maxLength={40}
            onSubmitEditing={handleRename}
            returnKeyType="done"
          />
          {editError ? <Text style={styles.errorText}>{editError}</Text> : null}
          <ColorPicker value={editColor} onChange={setEditColor} />
          <View style={styles.actions}>
            <Pressable onPress={() => setEditingId(null)} style={styles.actionButton}>
              <Text style={styles.actionText}>Cancel</Text>
            </Pressable>
            <Pressable
              testID="rename-save"
              onPress={handleRename}
              style={[styles.actionButton, styles.actionPrimary]}
            >
              <Text style={styles.actionPrimaryText}>Save</Text>
            </Pressable>
          </View>
        </View>
      );
    }

    return (
      <View style={[styles.card, styles.row]}>
        <View style={[styles.dot, { backgroundColor: item.color }]} />
        <View style={styles.flex}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.count}>
            {item.taskCount === 1 ? '1 task' : `${item.taskCount} tasks`}
          </Text>
        </View>
        <Pressable onPress={() => startEditing(item)} hitSlop={8} style={styles.inlineButton}>
          <Text style={styles.link}>Rename</Text>
        </Pressable>
        <Pressable onPress={() => handleDelete(item)} hitSlop={8} style={styles.inlineButton}>
          <Text style={styles.deleteText}>Delete</Text>
        </Pressable>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={100}
    >
      <FlatList
        data={categories}
        keyExtractor={(category) => String(category.id)}
        renderItem={renderItem}
        extraData={{ editingId, editName, editColor, editError }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={[styles.card, styles.createCard]}>
            <Text style={styles.label}>New category</Text>
            <TextInput
              testID="new-category-input"
              value={newName}
              onChangeText={(text) => {
                setNewName(text);
                setCreateError(null);
              }}
              placeholder="e.g. Health"
              placeholderTextColor={colors.textMuted}
              style={[styles.input, createError ? styles.inputError : null]}
              maxLength={40}
              onSubmitEditing={handleCreate}
              returnKeyType="done"
            />
            {createError ? <Text style={styles.errorText}>{createError}</Text> : null}
            <ColorPicker value={newColor} onChange={setNewColor} />
            <Pressable
              testID="create-category"
              onPress={handleCreate}
              style={({ pressed }) => [styles.addButton, pressed && styles.pressed]}
            >
              <Text style={styles.addButtonText}>Add category</Text>
            </Pressable>
          </View>
        }
        ListEmptyComponent={<Text style={styles.empty}>No categories yet.</Text>}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: spacing.lg,
    paddingBottom: 48,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  createCard: {
    marginBottom: spacing.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textMuted,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.background,
  },
  inputError: {
    borderColor: colors.danger,
  },
  errorText: {
    color: colors.danger,
    marginTop: spacing.xs,
  },
  colors: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  swatch: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 3,
    borderColor: 'transparent',
  },
  swatchSelected: {
    borderColor: colors.text,
  },
  addButton: {
    marginTop: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  addButtonText: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  pressed: {
    opacity: 0.8,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: spacing.md,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  count: {
    fontSize: 13,
    color: colors.textMuted,
    marginTop: 2,
  },
  inlineButton: {
    marginLeft: spacing.md,
  },
  link: {
    color: colors.primary,
    fontWeight: '600',
  },
  deleteText: {
    color: colors.danger,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  actionButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  actionText: {
    color: colors.text,
    fontWeight: '600',
  },
  actionPrimary: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  actionPrimaryText: {
    color: colors.primaryText,
    fontWeight: '700',
  },
  empty: {
    textAlign: 'center',
    color: colors.textMuted,
    marginTop: spacing.lg,
  },
});
