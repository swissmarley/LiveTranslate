import { useEffect } from 'react';

import { api } from '@/services/api-client';
import { useSettings } from '@/store/settings';

/**
 * Once the server is reachable, give each side its own voice (different genders when the
 * account has them) so it is obvious whose words are being read out.
 */
export function useDefaultVoices(serverReady: boolean) {
  const assigned = useSettings((state) => state.voicesAutoAssigned);

  useEffect(() => {
    if (!serverReady || assigned) return;
    let cancelled = false;
    api
      .voices()
      .then(({ voices, defaultVoiceId }) => {
        if (cancelled || voices.length === 0) return;
        const first = voices.find((v) => v.id === defaultVoiceId) ?? voices[0];
        const second =
          voices.find((v) => v.id !== first.id && v.gender && first.gender && v.gender !== first.gender) ??
          voices.find((v) => v.id !== first.id) ??
          first;
        const { voices: current, update } = useSettings.getState();
        update({
          voices: { me: current.me ?? first.id, them: current.them ?? second.id },
          voicesAutoAssigned: true,
        });
      })
      .catch(() => {
        // Retried next time the screen mounts; the server falls back to its default voice.
      });
    return () => {
      cancelled = true;
    };
  }, [serverReady, assigned]);
}
