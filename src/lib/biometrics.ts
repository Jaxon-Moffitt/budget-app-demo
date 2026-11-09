import { AuthenticationType } from 'expo-local-authentication';

/** How long the app can sit in the background before it asks for biometrics again. */
export const LOCK_AFTER_MS = 60_000;

export function shouldLockOnResume(backgroundedAt: number | null, now: number): boolean {
  return backgroundedAt !== null && now - backgroundedAt >= LOCK_AFTER_MS;
}

/** A user-facing name for the phone's biometric method, e.g. "Face ID". */
export function biometricLabel(types: AuthenticationType[], os: string): string {
  const face = types.includes(AuthenticationType.FACIAL_RECOGNITION);
  const finger = types.includes(AuthenticationType.FINGERPRINT);
  if (os === 'ios') {
    if (face) return 'Face ID';
    if (finger) return 'Touch ID';
  } else if (finger && !face) {
    return 'fingerprint';
  } else if (face && !finger) {
    return 'face unlock';
  }
  return 'biometrics';
}
