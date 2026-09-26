import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';

import type { Message } from '@/lib/conversation';
import { runTranslation, toggleSpeak } from '@/services/pipeline';
import { showToast } from '@/store/toast';

import { ActionSheet, type SheetAction } from './action-sheet';

export interface MessageTarget {
  sessionId: string;
  message: Message;
}

function copy(text: string) {
  Clipboard.setStringAsync(text)
    .then(() => showToast('Copied'))
    .catch(() => showToast('Could not copy', 'error'));
}

/** Long-press menu for a message. */
export function MessageActionSheet({
  target,
  onClose,
}: {
  target: MessageTarget | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const actions: SheetAction[] = [];
  if (target) {
    const { sessionId, message } = target;
    const translation = message.translation;
    if (translation) {
      actions.push(
        {
          label: 'Show full screen',
          icon: 'expand-outline',
          onPress: () =>
            router.push({ pathname: '/show', params: { session: sessionId, message: message.id } }),
        },
        { label: 'Play translation', icon: 'volume-high-outline', onPress: () => toggleSpeak(sessionId, message) },
        { label: 'Copy translation', icon: 'copy-outline', onPress: () => copy(translation) }
      );
    }
    actions.push({ label: 'Copy original', icon: 'document-text-outline', onPress: () => copy(message.original) });
    if (message.status === 'error') {
      actions.push({
        label: 'Retry translation',
        icon: 'refresh',
        onPress: () => void runTranslation(sessionId, message.id, false),
      });
    }
  }
  return (
    <ActionSheet visible={target !== null} title={target?.message.original} actions={actions} onClose={onClose} />
  );
}
