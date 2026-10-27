/**
 * Web implementation of the dialogs, using the browser's built-in `confirm` and `alert`
 * (react-native-web's `Alert.alert` does nothing).
 */
import type { ConfirmOptions } from './dialog';

export function confirm({ title, message }: ConfirmOptions, onConfirm: () => void): void {
  if (globalThis.confirm?.(`${title}\n\n${message}`)) {
    onConfirm();
  }
}

export function notify(title: string, message: string): void {
  globalThis.alert?.(`${title}\n\n${message}`);
}
