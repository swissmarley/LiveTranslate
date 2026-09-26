import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Radius } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import type { Language } from '@/lib/languages';

interface ComposeSheetProps {
  visible: boolean;
  from: Language;
  to: Language;
  onSubmit: (text: string) => void;
  onClose: () => void;
}

/** Type instead of speaking (noisy places, names, addresses). */
export function ComposeSheet({ visible, from, to, onSubmit, onClose }: ComposeSheetProps) {
  const colors = useTheme();
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    setText('');
    onSubmit(value);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.backdrop, { backgroundColor: colors.scrim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <View style={[styles.sheet, { backgroundColor: colors.surface, paddingBottom: insets.bottom + 12 }]}>
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              {from.flag} {from.name} → {to.flag} {to.name}
            </Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.textSecondary} />
            </Pressable>
          </View>
          <View style={[styles.inputRow, { backgroundColor: colors.surfaceAlt }]}>
            <TextInput
              autoFocus
              multiline
              value={text}
              onChangeText={setText}
              placeholder={`Type in ${from.name}…`}
              placeholderTextColor={colors.textTertiary}
              style={[styles.input, { color: colors.text }]}
              submitBehavior="blurAndSubmit"
              returnKeyType="send"
              onSubmitEditing={submit}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Translate"
              disabled={!text.trim()}
              onPress={submit}
              style={[styles.send, { backgroundColor: text.trim() ? colors.me : colors.surfacePressed }]}>
              <Ionicons name="arrow-up" size={22} color={colors.onAccent} />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
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
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: Radius.md,
    padding: 8,
    gap: 8,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 160,
    fontSize: 18,
    paddingHorizontal: 8,
    paddingTop: 10,
    paddingBottom: 10,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
