import { Alert, Platform } from 'react-native';

// Alert.alert has no buttons on web, so web falls back to the browser's own dialogs.
export const say = (title: string, message: string) => {
  if (Platform.OS === 'web') window.alert(`${title}\n${message}`);
  else Alert.alert(title, message);
};

// A one-time password is lost for good once its sheet is dismissed, so an accidental tap outside
// (or the back button) asks first. The sheet's own Done button closes without asking.
export const confirmDiscardPassword = () =>
  confirmAction('Close without copying?', 'The password is shown only once. If you close this, you will have to reset it again to get a new one.', 'Close anyway');

export const confirmAction = (title: string, message: string, okLabel = 'Yes'): Promise<boolean> => {
  if (Platform.OS === 'web') return Promise.resolve(window.confirm(`${title}\n${message}`));
  return new Promise((resolve) => {
    Alert.alert(title, message, [
      { text: 'No', style: 'cancel', onPress: () => resolve(false) },
      { text: okLabel, style: 'destructive', onPress: () => resolve(true) },
    ], { cancelable: true, onDismiss: () => resolve(false) });
  });
};
