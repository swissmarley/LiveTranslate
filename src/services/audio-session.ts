import { setAudioModeAsync } from 'expo-audio';

/**
 * Loud playback through the main speaker, even with the silent switch on. Recording leaves
 * the iOS session in a record category, so this runs before every playback.
 */
export async function enterPlaybackMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      interruptionMode: 'duckOthers',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch (error) {
    console.warn('[audio] could not switch to playback mode', error);
  }
}

export async function enterRecordingMode(): Promise<void> {
  try {
    await setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: true,
      interruptionMode: 'doNotMix',
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });
  } catch (error) {
    console.warn('[audio] could not switch to recording mode', error);
  }
}
