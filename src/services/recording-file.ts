import { File } from 'expo-file-system';

export interface RecordingData {
  bytes: Uint8Array<ArrayBuffer>;
  contentType: string;
}

/** Reads (and then deletes) a finished recording. Phones record AAC in an .m4a container. */
export async function readRecording(uri: string): Promise<RecordingData> {
  const file = new File(uri);
  const bytes = await file.bytes();
  try {
    file.delete();
  } catch {
    // Cache files are cleaned up by the OS eventually.
  }
  return { bytes, contentType: 'audio/mp4' };
}
