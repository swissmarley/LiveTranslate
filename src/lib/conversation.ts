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
  input: 'voice' | 'text';
  createdAt: number;
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
