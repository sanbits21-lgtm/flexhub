import { Alert, Platform } from 'react-native';

// Alert.alert has no buttons on web, so web falls back to the browser's own dialogs.
export const say = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
};

export const confirmAction = (title: string, message: string, okLabel = 'Yes'): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
};
