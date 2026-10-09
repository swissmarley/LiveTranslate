import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import {
  createId,
  type Message,
  type Session,
  type SessionKind,
} from '@/lib/conversation';
import type { LanguageId } from '@/lib/languages';

import { useSettings } from './settings';

const MAX_SESSIONS = 100;
const MAX_MESSAGES = 500;

export type MessageDraft = Omit<Message, 'id' | 'createdAt' | 'status'>;

interface SessionsState {
  /** Newest first. Sessions are created lazily with their first message. */
  sessions: Session[];
  activeIds: Record<SessionKind, string | null>;
  /** Returns the active session of this kind, creating it if needed. */
  ensureActiveSession: (
    kind: SessionKind,
    languages: { mine: LanguageId; theirs: LanguageId }
  ) => string;
  addMessage: (sessionId: string, draft: MessageDraft) => Message;
  updateMessage: (sessionId: string, messageId: string, patch: Partial<Message>) => void;
  getMessage: (sessionId: string, messageId: string) => Message | undefined;
  startNewSession: (kind: SessionKind) => void;
  deleteSession: (sessionId: string) => void;
  clearHistory: () => void;
  /**
   * Deletes sessions last used longer ago than `maxAgeMs` (0: all but the active ones) and
   * returns them. Their cached audio is the caller's to delete (pipeline's pruneConversations).
   */
  pruneHistory: (maxAgeMs: number) => Session[];
}

function mapSession(sessions: Session[], id: string, fn: (session: Session) => Session): Session[] {
  return sessions.map((session) => (session.id === id ? fn(session) : session));
}

export const useSessions = create<SessionsState>()(
  persist(
    (set, get) => ({
      sessions: [],
      activeIds: { conversation: null, listen: null },

      ensureActiveSession: (kind, languages) => {
        const { sessions, activeIds } = get();
        const activeId = activeIds[kind];
        const active = activeId ? sessions.find((s) => s.id === activeId) : undefined;
        if (active) {
          if (active.languages.mine !== languages.mine || active.languages.theirs !== languages.theirs) {
            set({ sessions: mapSession(sessions, active.id, (s) => ({ ...s, languages })) });
          }
          return active.id;
        }
        const now = Date.now();
        const session: Session = {
          id: createId(),
          kind,
          createdAt: now,
          updatedAt: now,
          languages,
          messages: [],
        };
        set({
          sessions: [session, ...sessions].slice(0, MAX_SESSIONS),
          activeIds: { ...activeIds, [kind]: session.id },
        });
        return session.id;
      },

      addMessage: (sessionId, draft) => {
        const message: Message = { ...draft, id: createId(), createdAt: Date.now(), status: 'translating' };
        set((state) => {
          const session = state.sessions.find((s) => s.id === sessionId);
          if (!session) return state;
          const updated: Session = {
            ...session,
            updatedAt: message.createdAt,
            messages: [...session.messages, message].slice(-MAX_MESSAGES),
          };
          // Most recently used session first.
          return { sessions: [updated, ...state.sessions.filter((s) => s.id !== sessionId)] };
        });
        return message;
      },

      updateMessage: (sessionId, messageId, patch) =>
        set((state) => ({
          sessions: mapSession(state.sessions, sessionId, (session) => ({
            ...session,
            messages: session.messages.map((m) => (m.id === messageId ? { ...m, ...patch } : m)),
          })),
        })),

      getMessage: (sessionId, messageId) =>
        get()
          .sessions.find((s) => s.id === sessionId)
          ?.messages.find((m) => m.id === messageId),

      startNewSession: (kind) => set((state) => ({ activeIds: { ...state.activeIds, [kind]: null } })),

      deleteSession: (sessionId) =>
        set((state) => ({
          sessions: state.sessions.filter((s) => s.id !== sessionId),
          activeIds: {
            conversation: state.activeIds.conversation === sessionId ? null : state.activeIds.conversation,
            listen: state.activeIds.listen === sessionId ? null : state.activeIds.listen,
          },
        })),

      clearHistory: () => set({ sessions: [], activeIds: { conversation: null, listen: null } }),

      pruneHistory: (maxAgeMs) => {
        const state = get();
        const cutoff = Date.now() - maxAgeMs;
        const active = new Set(Object.values(state.activeIds));
        const expired = (s: Session) => (maxAgeMs === 0 ? !active.has(s.id) : s.updatedAt < cutoff);
        const removed = state.sessions.filter(expired);
        if (removed.length === 0) return removed;
        const sessions = state.sessions.filter((s) => !expired(s));
        const kept = new Set(sessions.map((s) => s.id));
        const keep = (id: string | null) => (id && kept.has(id) ? id : null);
        set({
          sessions,
          activeIds: { conversation: keep(state.activeIds.conversation), listen: keep(state.activeIds.listen) },
        });
        return removed;
      },
    }),
    {
      name: 'live-translate/sessions',
      version: 1,
      storage: createJSONStorage(() => AsyncStorage),
      // With history turned off, nothing is written to the phone.
      partialize: (state) =>
        useSettings.getState().keepHistory === 'off'
          ? { sessions: [], activeIds: { conversation: null, listen: null } }
          : { sessions: state.sessions, activeIds: state.activeIds },
      // Translations that were in flight when the app was closed will never finish.
      merge: (persisted, current) => {
        const data = persisted as Partial<Pick<SessionsState, 'sessions' | 'activeIds'>> | undefined;
        const sessions = (data?.sessions ?? []).map((session) => ({
          ...session,
          messages: session.messages.map((m) =>
            m.status === 'translating' ? { ...m, status: 'error' as const, error: 'Interrupted' } : m
          ),
        }));
        return { ...current, sessions, activeIds: data?.activeIds ?? current.activeIds };
      },
    }
  )
);

const NO_MESSAGES: Message[] = [];

/** The active session of a kind, or undefined before its first message. */
export function useActiveSession(kind: SessionKind): Session | undefined {
  return useSessions((state) => {
    const id = state.activeIds[kind];
    return id ? state.sessions.find((s) => s.id === id) : undefined;
  });
}

export function useActiveMessages(kind: SessionKind): Message[] {
  return useActiveSession(kind)?.messages ?? NO_MESSAGES;
}

export function useSession(sessionId: string | undefined): Session | undefined {
  return useSessions((state) => (sessionId ? state.sessions.find((s) => s.id === sessionId) : undefined));
}
