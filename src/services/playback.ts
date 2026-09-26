/**
 * Single-channel audio playback: starting a clip stops the previous one. Exposes which
 * clip is loading/playing so message bubbles can show it.
 */

import { createAudioPlayer, type AudioPlayer } from 'expo-audio';

import { enterPlaybackMode } from './audio-session';

export interface PlaybackState {
  /** Clip being synthesized/downloaded. */
  preparingId: string | null;
  /** Clip being played. */
  playingId: string | null;
}

let state: PlaybackState = { preparingId: null, playingId: null };
let active: { player: AudioPlayer; finish: () => void } | null = null;
let generation = 0;
const listeners = new Set<() => void>();

function setState(patch: Partial<PlaybackState>): void {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

export function subscribePlayback(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPlaybackState(): PlaybackState {
  return state;
}

/** Marks a clip as loading. Returns a token that is still current if nothing else started since. */
export function beginPreparing(id: string): number {
  stopPlayback();
  setState({ preparingId: id });
  return generation;
}

export function isCurrent(token: number): boolean {
  return token === generation;
}

/** Clears the loading state when preparation failed. */
export function cancelPreparing(token: number): void {
  if (isCurrent(token) && state.preparingId) setState({ preparingId: null });
}

/** Plays an audio URI; resolves when it ends or is stopped. */
export async function playAudio(uri: string, id: string, token: number = generation): Promise<void> {
  if (!isCurrent(token)) return;
  await enterPlaybackMode();
  if (!isCurrent(token)) return;

  await new Promise<void>((resolve) => {
    const player = createAudioPlayer({ uri });
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(watchdog);
      subscription.remove();
      try {
        player.pause();
        player.remove();
      } catch {
        // already released
      }
      if (active?.player === player) {
        active = null;
        setState({ playingId: null });
      }
      resolve();
    };
    const subscription = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish || status.error) finish();
    });
    const watchdog = setTimeout(finish, 120_000);
    active = { player, finish };
    setState({ preparingId: null, playingId: id });
    player.play();
  });
}

/** Stops the current clip and cancels any clip that is still loading. */
export function stopPlayback(): void {
  generation++;
  active?.finish();
  if (state.preparingId || state.playingId) setState({ preparingId: null, playingId: null });
}
