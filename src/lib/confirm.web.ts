/** Web version: react-native-web's Alert does nothing, so use the browser's dialog. */
export function confirmDestructive(
  title: string,
  message: string,
  _actionLabel: string,
  onConfirm: () => void,
) {
  if (window.confirm(message ? `${title}\n\n${message}` : title)) onConfirm();
}
