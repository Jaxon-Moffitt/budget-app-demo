import { AuthenticationType } from 'expo-local-authentication';

import { LOCK_AFTER_MS, biometricLabel, shouldLockOnResume } from '../biometrics';

describe('shouldLockOnResume', () => {
  it('stays unlocked after a short trip to the background', () => {
    expect(shouldLockOnResume(1000, 1000 + LOCK_AFTER_MS - 1)).toBe(false);
  });

  it('locks after the timeout', () => {
    expect(shouldLockOnResume(1000, 1000 + LOCK_AFTER_MS)).toBe(true);
  });

  it('does nothing if the app was never backgrounded', () => {
    expect(shouldLockOnResume(null, Date.now())).toBe(false);
  });
});

describe('biometricLabel', () => {
  const { FACIAL_RECOGNITION, FINGERPRINT } = AuthenticationType;

  it.each([
    [[FACIAL_RECOGNITION], 'ios', 'Face ID'],
    [[FINGERPRINT], 'ios', 'Touch ID'],
    [[FINGERPRINT], 'android', 'fingerprint'],
    [[FACIAL_RECOGNITION], 'android', 'face unlock'],
    [[FINGERPRINT, FACIAL_RECOGNITION], 'android', 'biometrics'],
    [[], 'android', 'biometrics'],
  ])('%p on %s → %s', (types, os, label) => {
    expect(biometricLabel(types, os)).toBe(label);
  });
});
