/**
 * Whether the microphone is in use. Playback must wait: on iOS, switching the audio session
 * to playback while the live stream runs would cut the recording.
 */
let active = false;

export function setCaptureActive(value: boolean): void {
  active = value;
}

export function isCaptureActive(): boolean {
  return active;
}
