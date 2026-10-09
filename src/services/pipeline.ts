/** Turns recognized speech into translations, and translations into speech. */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import type { SpeakRequest } from '@/lib/api-types';
import type { Message, Session, Speaker } from '@/lib/conversation';
import { splitForSpeech } from '@/lib/speech-chunks';
import { useSessions } from '@/store/sessions';
import { useSettings } from '@/store/settings';
import { showToast } from '@/store/toast';

import { api, ApiClientError, errorMessage } from './api-client';
import { isCaptureActive } from './capture-state';
import {
  beginPreparing,
  cancelPreparing,
  getPlaybackState,
  isCurrent,
  playAudio,
  stopPlayback,
} from './playback';
import { forgetSpeech, getSpeechUri } from './speech-cache';
import { speechCacheKey } from './speech-key';

function errorHaptic(): void {
  if (Platform.OS === 'web') return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
}

/** Conversation: translate what one side said and read it aloud to the other side. */
export async function translateUtterance(
  speaker: Speaker,
  text: string,
  input: 'voice' | 'text' = 'voice'
): Promise<void> {
  const { myLanguage, theirLanguage, autoSpeak } = useSettings.getState();
  const sessions = useSessions.getState();
  const sessionId = sessions.ensureActiveSession('conversation', {
    mine: myLanguage,
    theirs: theirLanguage,
  });
  const message = sessions.addMessage(sessionId, {
    speaker,
    input,
    original: text,
    source: speaker === 'me' ? myLanguage : theirLanguage,
    target: speaker === 'me' ? theirLanguage : myLanguage,
  });
  await runTranslation(sessionId, message.id, autoSpeak);
}

/** Listen mode: translate a stretch of what someone nearby is saying. */
export async function translateHeard(text: string): Promise<void> {
  const { listenSource, listenTarget } = useSettings.getState();
  const sessions = useSessions.getState();
  const sessionId = sessions.ensureActiveSession('listen', {
    mine: listenTarget,
    theirs: listenSource,
  });
  const message = sessions.addMessage(sessionId, {
    speaker: 'them',
    input: 'voice',
    original: text,
    source: listenSource,
    target: listenTarget,
  });
  await runTranslation(sessionId, message.id, false);
}

/** Translates a stored message (also used to retry failed ones). */
export async function runTranslation(
  sessionId: string,
  messageId: string,
  speak: boolean
): Promise<void> {
  const message = useSessions.getState().getMessage(sessionId, messageId);
  if (!message) return;
  useSessions
    .getState()
    .updateMessage(sessionId, messageId, { status: 'translating', error: undefined, errorCode: undefined });
  try {
    const { translation } = await api.translate({
      text: message.original,
      source: message.source,
      target: message.target,
      politeness: useSettings.getState().politeness,
    });
    useSessions.getState().updateMessage(sessionId, messageId, { status: 'done', translation });
  } catch (error) {
    useSessions
      .getState()
      .updateMessage(sessionId, messageId, {
        status: 'error',
        error: errorMessage(error),
        errorCode: error instanceof ApiClientError ? error.code : undefined,
      });
    errorHaptic();
    return;
  }
  // Don't talk over someone who already started speaking.
  if (speak && !isCaptureActive()) await speakMessage(sessionId, messageId);
}

/** The clips a message's translation is read aloud in, with the current voice and speed. */
function speechRequests(message: Message): SpeakRequest[] {
  if (!message.translation) return [];
  const { voices, speed } = useSettings.getState();
  return splitForSpeech(message.translation).map((text) => ({
    text,
    language: message.target,
    voiceId: voices[message.speaker] ?? undefined,
    speed,
  }));
}

/** Reads a message's translation aloud in the target language, a few sentences at a time. */
export async function speakMessage(sessionId: string, messageId: string): Promise<void> {
  const message = useSessions.getState().getMessage(sessionId, messageId);
  const parts = message ? speechRequests(message) : [];
  if (parts.length === 0) return;
  const speechOf = async (part: SpeakRequest) => {
    const uri = await getSpeechUri(part);
    rememberSpeech(sessionId, messageId, speechCacheKey(part));
    return uri;
  };
  const token = beginPreparing(messageId);
  try {
    let next = speechOf(parts[0]);
    for (let i = 0; i < parts.length; i++) {
      const uri = await next;
      if (i + 1 < parts.length) {
        // Synthesize the next part while this one plays.
        next = speechOf(parts[i + 1]);
        next.catch(() => {});
      }
      if (isCaptureActive()) {
        cancelPreparing(token);
        return;
      }
      await playAudio(uri, messageId, token);
      // Stopped, or another clip or the microphone took over.
      if (!isCurrent(token)) return;
    }
  } catch (error) {
    cancelPreparing(token);
    showToast(`Couldn't read the translation aloud. ${errorMessage(error)}`, 'error');
  }
}

/** Tap on a message: play it, or stop it when it is already playing. */
export function toggleSpeak(sessionId: string, message: Message): void {
  const { playingId, preparingId } = getPlaybackState();
  if (playingId === message.id || preparingId === message.id) {
    stopPlayback();
    return;
  }
  if (isCaptureActive()) {
    showToast('Stop the microphone first to play audio.');
    return;
  }
  void speakMessage(sessionId, message.id);
}

/** Notes on the message which cached clip it was spoken in (voice and speed may change later). */
function rememberSpeech(sessionId: string, messageId: string, key: string): void {
  const message = useSessions.getState().getMessage(sessionId, messageId);
  if (!message || message.speechKeys?.includes(key)) return;
  useSessions.getState().updateMessage(sessionId, messageId, { speechKeys: [...(message.speechKeys ?? []), key] });
}

const speechKeysOf = (sessions: Session[]) =>
  sessions.flatMap((session) => session.messages.flatMap((message) => message.speechKeys ?? []));

/** Deletes a conversation together with its cached audio. */
export function deleteConversation(sessionId: string): void {
  const session = useSessions.getState().sessions.find((s) => s.id === sessionId);
  if (session) forgetSpeech(speechKeysOf([session]));
  useSessions.getState().deleteSession(sessionId);
}

/** Applies the history retention setting: drops old conversations and their cached audio. */
export function pruneConversations(maxAgeMs: number): void {
  forgetSpeech(speechKeysOf(useSessions.getState().pruneHistory(maxAgeMs)));
}
