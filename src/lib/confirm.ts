import { Alert } from 'react-native';

/** Asks before something destructive; runs `onConfirm` only if the person agrees. */
export function confirmDestructive(
  title: string,
  message: string,
  actionLabel: string,
  onConfirm: () => void,
) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: actionLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
