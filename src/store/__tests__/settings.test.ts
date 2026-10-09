import AsyncStorage from '@react-native-async-storage/async-storage';

import { useSettings } from '../settings';

jest.mock('@react-native-async-storage/async-storage', () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- jest.mock factories can't import
  require('@react-native-async-storage/async-storage/jest/async-storage-mock')
);

const KEY = 'live-translate/settings';

describe('history retention default', () => {
  it('keeps 30 days on a new install and shows the privacy notice', async () => {
    await AsyncStorage.clear();
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().keepHistory).toBe('30d');
    expect(useSettings.getState().privacyNoticeSeen).toBe(false);
  });

  it('keeps everything for installs from before retention existed', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { myLanguage: 'de-DE', autoSpeak: false }, version: 1 }));
    await useSettings.persist.rehydrate();
    expect(useSettings.getState()).toMatchObject({ keepHistory: 'forever', myLanguage: 'de-DE', autoSpeak: false });
  });

  it('keeps a retention that was chosen', async () => {
    await AsyncStorage.setItem(KEY, JSON.stringify({ state: { keepHistory: '7d' }, version: 1 }));
    await useSettings.persist.rehydrate();
    expect(useSettings.getState().keepHistory).toBe('7d');
  });
});
