/**
 * Light or dark as chosen in Settings (or the phone's, for "Phone").
 * Comes from AppearanceProvider rather than react-native, because the web
 * can't force react-native's scheme.
 */
export { useResolvedColorScheme as useColorScheme } from '@/providers/appearance-provider';
