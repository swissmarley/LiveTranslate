export interface RecordingData {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/** Web recordings are blob: URLs produced by MediaRecorder (usually audio/webm). */
export async function readRecording(uri: string): Promise<RecordingData> {
  const blob = await (await fetch(uri)).blob();
  return { bytes: new Uint8Array(await blob.arrayBuffer()), contentType: blob.type || 'audio/webm' };
}
