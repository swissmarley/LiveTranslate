import type { LanguageId } from './languages';

/** "me" is the phone owner (bottom half), "them" the person they talk to (top half). */
export type Speaker = 'me' | 'them';

export const otherSpeaker = (speaker: Speaker): Speaker => (speaker === 'me' ? 'them' : 'me');

export type MessageStatus = 'translating' | 'done' | 'error';

export interface Message {
  id: string;
  speaker: Speaker;
  /** Language the words were spoken/typed in. */
  source: LanguageId;
  /** Language they were translated into. */
  target: LanguageId;
  original: string;
  translation?: string;
  status: MessageStatus;
  error?: string;
  /** Machine-readable reason for `error` (e.g. "text_too_long"). */
  errorCode?: string;
  /** Cache keys of the clips this translation was spoken in, to delete them with the message. */
  speechKeys?: string[];
  input: 'voice' | 'text';
  createdAt: number;
}

/** Failures that end the same way however often they are retried. */
const PERMANENT_ERRORS = new Set(['text_too_long', 'unsupported_language', 'invalid_request']);

/** Whether retrying a failed message can help (not when the text is too long, for example). */
export function canRetry(message: Message): boolean {
  return message.status === 'error' && !PERMANENT_ERRORS.has(message.errorCode ?? '');
}

export type SessionKind = 'conversation' | 'listen';

export interface Session {
  id: string;
  kind: SessionKind;
  createdAt: number;
  updatedAt: number;
  /** For conversations: owner + partner languages. For listen: source + target. */
  languages: { mine: LanguageId; theirs: LanguageId };
  messages: Message[];
}

export function createId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
