import Ionicons from '@expo/vector-icons/Ionicons';
import { Modal, Pressable, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

import type { IconName } from './icon-button';

export interface SheetAction {
  label: string;
  icon: IconName;
  destructive?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  title?: string;
  actions: SheetAction[];
  onClose: () => void;
}

export function ActionSheet({ visible, title, actions, onClose }: ActionSheetProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: colors.scrim }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 8 }]}
          onPress={() => {}}>
          {title ? (
            <Text numberOfLines={3} style={[styles.title, { color: colors.textSecondary }]}>
              {title}
            </Text>
          ) : null}
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              onPress={() => {
                onClose();
                action.onPress();
              }}
              style={({ pressed }) => [styles.action, pressed && { backgroundColor: colors.surfacePressed }]}>
              <Ionicons name={action.icon} size={22} color={action.destructive ? colors.danger : colors.text} />
              <Text style={[styles.label, { color: action.destructive ? colors.danger : colors.text }]}>
                {action.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.cancel,
              { backgroundColor: pressed ? colors.surfacePressed : colors.surfaceAlt },
            ]}>
            <Text style={[styles.cancelText, { color: colors.text }]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingTop: 12,
    paddingHorizontal: 12,
  },
  title: {
    fontSize: 14,
    lineHeight: 19,
    paddingHorizontal: 12,
    paddingBottom: 8,
  },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: Radius.sm,
  },
  label: {
    fontSize: 17,
  },
  cancel: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: Radius.md,
  },
  cancelText: {
    fontSize: 17,
    fontWeight: '600',
  },
});
