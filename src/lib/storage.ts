import * as SecureStore from 'expo-secure-store';

import { createChunkedStorage } from './chunked-storage';

/**
 * Where the login session lives: the iOS Keychain / Android Keystore,
 * split into chunks because of the keychain's size limit. The web version
 * (storage.web.ts) uses the browser's localStorage instead.
 */
export const authStorage = createChunkedStorage(SecureStore);

/** Small per-device settings (theme, biometric unlock). */
export const prefStorage = {
  getItem: (key: string) => SecureStore.getItemAsync(key),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key, value),
};
