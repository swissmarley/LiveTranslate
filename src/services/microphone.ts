import { requestRecordingPermissionsAsync } from 'expo-audio';

/** Asks for the microphone. Returns what stops it from being used, or null when it can be. */
export async function requestMicrophone(): Promise<string | null> {
  const permission = await requestRecordingPermissionsAsync().catch(() => null);
  return permission?.granted
    ? null
    : 'Microphone access is off. Allow it in your phone settings to translate speech.';
}
