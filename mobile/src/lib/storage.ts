import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// SecureStore has no web implementation; localStorage stands in so the app can be
// previewed in a browser. On devices values live in the Keychain / Keystore.
export const store = {
  get: async (k: string): Promise<string | null> => (Platform.OS === 'web' ? localStorage.getItem(k) : SecureStore.getItemAsync(k)),
  set: async (k: string, v: string): Promise<void> => (Platform.OS === 'web' ? localStorage.setItem(k, v) : SecureStore.setItemAsync(k, v)),
  del: async (k: string): Promise<void> => (Platform.OS === 'web' ? localStorage.removeItem(k) : SecureStore.deleteItemAsync(k)),
};
