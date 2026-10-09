import { useSessions } from '../sessions';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't import
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const DAY = 86_400_000;

function seed() {
  const store = useSessions.getState();
  store.clearHistory();
  const old = store.ensureActiveSession('listen', { mine: 'en-US', theirs: 'de-DE' });
  store.addMessage(old, { speaker: 'them', input: 'voice', original: 'Hallo', source: 'de-DE', target: 'en-US' });
  store.startNewSession('listen');
  const current = store.ensureActiveSession('conversation', { mine: 'en-US', theirs: 'de-DE' });
  // The listen session was last used 40 days ago.
  useSessions.setState((state) => ({
    sessions: state.sessions.map((s) => (s.id === old ? { ...s, updatedAt: Date.now() - 40 * DAY } : s)),
  }));
  return { old, current };
}

describe('pruneHistory', () => {
  it('removes and returns sessions older than the limit', () => {
    const { old, current } = seed();
    const removed = useSessions.getState().pruneHistory(30 * DAY);
    expect(removed.map((s) => s.id)).toEqual([old]);
    expect(removed[0].messages[0].original).toBe('Hallo');
    expect(useSessions.getState().sessions.map((s) => s.id)).toEqual([current]);
    expect(useSessions.getState().pruneHistory(30 * DAY)).toEqual([]);
  });

  it('keeps only the active sessions when history is off', () => {
    const { old, current } = seed();
    expect(useSessions.getState().pruneHistory(0).map((s) => s.id)).toEqual([old]);
    expect(useSessions.getState().sessions.map((s) => s.id)).toEqual([current]);
    expect(useSessions.getState().activeIds.conversation).toBe(current);
  });
});
