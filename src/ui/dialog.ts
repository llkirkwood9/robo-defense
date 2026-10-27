/**
 * Confirmation and notice dialogs, shown with the system alert.
 *
 * Always use these instead of `Alert.alert`: react-native-web ships `Alert` as a no-op, so the web
 * build has its own implementation (`dialog.web.ts`).
 */
import { Alert } from 'react-native';

export interface ConfirmOptions {
  title: string;
  message: string;
  /** Label of the confirming button. */
  confirmLabel: string;
  destructive?: boolean;
}

/** Asks the player to confirm an action; `onConfirm` runs only if they do. */
export function confirm(
  { title, message, confirmLabel, destructive = false }: ConfirmOptions,
  onConfirm: () => void,
): void {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: destructive ? 'destructive' : 'default', onPress: onConfirm },
  ]);
}

/** Shows a message with a single dismiss button. */
export function notify(title: string, message: string): void {
  Alert.alert(title, message);
}
