import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  useAudioRecorder,
  useAudioStream,
  type AudioStream,
  type AudioStreamOptions,
  type RecordingOptions,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';
import { Animated, AppState, Platform } from 'react-native';

import { getLanguage, type LanguageId } from '@/lib/languages';
import { ApiClientError, errorMessage } from '@/services/api-client';
import {
  LiveCapture,
  RecordedCapture,
  type Capture,
  type CaptureCallbacks,
  type CaptureOptions,
} from '@/services/capture';
import { setCaptureActive } from '@/services/capture-state';
import { STT_SAMPLE_RATE } from '@/services/pcm';
import { stopPlayback } from '@/services/playback';
import { PAUSE_SECONDS, useSettings } from '@/store/settings';
import { showToast } from '@/store/toast';

/** expo-audio's PCM stream (SDK 56+). Missing on web, where we record instead. */
const STREAM_SUPPORTED =
  Platform.OS !== 'web' &&
  typeof (AudioModule as unknown as Record<string, unknown>).AudioStream === 'function';

function useNoStream(_options: AudioStreamOptions): { stream: AudioStream | null } {
  return { stream: null };
}

const useMicrophoneStream: (options: AudioStreamOptions) => { stream: AudioStream | null } =
  STREAM_SUPPORTED ? useAudioStream : useNoStream;

/** Mono AAC, small enough to upload quickly over mobile data. */
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  sampleRate: 44_100,
  numberOfChannels: 1,
  bitRate: 64_000,
  isMeteringEnabled: true,
  web: { mimeType: 'audio/webm', bitsPerSecond: 64_000 },
};

export type SpeechPhase = 'idle' | 'starting' | 'listening' | 'transcribing';

export interface SpeechContext {
  /** Caller-defined label for who is speaking (e.g. "me" / "them"). */
  tag: string;
  language: LanguageId;
}

export interface SpeechInputEvents {
  onSegment: (text: string, context: SpeechContext) => void;
  onNoSpeech?: (context: SpeechContext) => void;
  onError?: (message: string, context: SpeechContext) => void;
}

export interface StartOptions {
  tag: string;
  language: LanguageId;
  /** Keep listening and emit a segment per sentence (Listen mode). */
  continuous?: boolean;
}

/** Microphone → text, one session at a time. */
export function useSpeechInput(events: SpeechInputEvents) {
  const eventsRef = useRef(events);
  useEffect(() => {
    eventsRef.current = events;
  });

  const [phase, setPhase] = useState<SpeechPhase>('idle');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [partial, setPartial] = useState('');
  const [level] = useState(() => new Animated.Value(0));
  const captureRef = useRef<Capture | null>(null);
  /** Set while asking for the microphone permission, before a capture exists. */
  const pendingRef = useRef<object | null>(null);

  const { stream } = useMicrophoneStream({
    sampleRate: STT_SAMPLE_RATE,
    channels: 1,
    encoding: 'int16',
    onBuffer: (buffer) => captureRef.current?.handleBuffer?.(buffer),
  });
  const recorder = useAudioRecorder(RECORDING_OPTIONS);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') captureRef.current?.cancel();
    });
    return () => {
      subscription.remove();
      pendingRef.current = null;
      captureRef.current?.cancel();
    };
  }, []);

  function cancel() {
    if (pendingRef.current) {
      pendingRef.current = null;
      resetState();
    }
    captureRef.current?.cancel();
  }

  function resetState() {
    setPhase('idle');
    setActiveTag(null);
    setPartial('');
    level.setValue(0);
  }

  async function start({ tag, language: languageId, continuous = false }: StartOptions) {
    // Refs, not state: a quick double tap must not start two sessions.
    if (captureRef.current || pendingRef.current) return;
    const pending = {};
    pendingRef.current = pending;
    const language = getLanguage(languageId);
    const context: SpeechContext = { tag, language: language.id };
    stopPlayback();
    setActiveTag(tag);
    setPhase('starting');

    const permission = await requestRecordingPermissionsAsync().catch(() => null);
    if (pendingRef.current !== pending) return; // cancelled while asking
    pendingRef.current = null;
    if (!permission?.granted) {
      resetState();
      eventsRef.current.onError?.(
        'Microphone access is off. Allow it in your phone settings to translate speech.',
        context
      );
      return;
    }

    const { inputMode, pause } = useSettings.getState();
    let capture: Capture | null = null;
    const isCurrent = () => capture !== null && captureRef.current === capture;
    const callbacks: CaptureCallbacks = {
      onListening: () => isCurrent() && setPhase('listening'),
      onPartial: (text) => isCurrent() && setPartial(text),
      onLevel: (value) => level.setValue(value),
      onSegment: (text) => eventsRef.current.onSegment(text, context),
      onTranscribing: () => isCurrent() && setPhase('transcribing'),
      onNotice: (message) => eventsRef.current.onError?.(message, context),
      onEnd: (result) => {
        if (isCurrent()) {
          captureRef.current = null;
          setCaptureActive(false);
          resetState();
        }
        if (result.reason === 'no-speech') eventsRef.current.onNoSpeech?.(context);
        if (result.reason === 'error') eventsRef.current.onError?.(result.message, context);
      },
    };
    const options: CaptureOptions = {
      language,
      silenceSecs: PAUSE_SECONDS[pause],
      continuous,
      callbacks,
    };

    const live = inputMode === 'live' && stream !== null;
    const launch = async (next: Capture) => {
      capture = next;
      captureRef.current = next;
      setCaptureActive(true);
      await next.start();
    };

    try {
      try {
        await launch(live && stream ? new LiveCapture(stream, options) : new RecordedCapture(recorder, options));
      } catch (error) {
        // Server/network problems would break both modes; a native stream failure would not.
        if (!live || error instanceof ApiClientError || !isCurrent()) throw error;
        await launch(new RecordedCapture(recorder, options));
        showToast('Live recognition is unavailable here, so recording instead.');
      }
    } catch (error) {
      if (isCurrent()) {
        captureRef.current = null;
        setCaptureActive(false);
        resetState();
      }
      eventsRef.current.onError?.(errorMessage(error), context);
    }
  }

  return {
    phase,
    /** Tag of the side currently using the microphone. */
    activeTag,
    /** Live transcript while speaking (live mode only). */
    partial,
    /** Microphone loudness 0–1. */
    level,
    /** Whether real-time streaming is possible in this runtime. */
    liveAvailable: stream !== null,
    start,
    /** Finish and keep what was said. */
    stop: () => (pendingRef.current ? cancel() : captureRef.current?.stop()),
    /** Abort and discard. */
    cancel,
  };
}
