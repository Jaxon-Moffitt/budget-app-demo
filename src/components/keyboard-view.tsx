import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Keeps a form's focused field above the keyboard. Android apps now draw
 * edge to edge, so the system no longer shrinks the screen for the
 * keyboard and both platforms need the padding. In a browser the page
 * handles it.
 */
export function KeyboardView({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return (
    <KeyboardAvoidingView style={style} behavior={Platform.OS === 'web' ? undefined : 'padding'}>
      {children}
    </KeyboardAvoidingView>
  );
}
