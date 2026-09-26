import { useSyncExternalStore } from 'react';

import { getPlaybackState, subscribePlayback, type PlaybackState } from '@/services/playback';

/** Which clip is loading / playing right now. */
export function usePlayback(): PlaybackState {
  return useSyncExternalStore(subscribePlayback, getPlaybackState, getPlaybackState);
}
