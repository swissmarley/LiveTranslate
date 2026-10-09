/**
 * Web: expo-audio reports every getUserMedia failure as "permission denied", so ask the browser
 * directly and tell a missing or busy microphone apart from a refused permission.
 */
export async function requestMicrophone(): Promise<string | null> {
  if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
    return 'The microphone only works on a secure (https) page.';
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((track) => track.stop());
    return null;
  } catch (error) {
    const name = error instanceof Error ? error.name : '';
    if (name === 'NotFoundError' || name === 'OverconstrainedError') {
      return 'No microphone was found. Connect one and try again.';
    }
    if (name === 'NotReadableError' || name === 'AbortError') {
      return 'The microphone is in use by another app or could not be started.';
    }
    return 'Microphone access is off. Allow it in your browser settings to translate speech.';
  }
}
