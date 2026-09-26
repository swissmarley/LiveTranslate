/**
 * Colors for light and dark mode. "me" (blue) is the phone owner, "them" (orange) the person
 * they are talking to — used consistently for mic buttons, bubbles and language pills.
 */

import '@/global.css';

import { Platform } from 'react-native';

import type { Speaker } from '@/lib/conversation';

export interface Palette {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfacePressed: string;
  text: string;
  textSecondary: string;
  textTertiary: string;
  border: string;
  me: string;
  meSoft: string;
  them: string;
  themSoft: string;
  onAccent: string;
  danger: string;
  dangerSoft: string;
  success: string;
  scrim: string;
}

export const Colors: Record<'light' | 'dark', Palette> = {
  light: {
    background: '#F2F4F8',
    surface: '#FFFFFF',
    surfaceAlt: '#E8ECF2',
    surfacePressed: '#DDE2EA',
    text: '#0D1117',
    textSecondary: '#545E6E',
    textTertiary: '#8A93A2',
    border: '#DCE1E9',
    me: '#2F6BFF',
    meSoft: '#E3EBFF',
    them: '#EA5A22',
    themSoft: '#FFE8DE',
    onAccent: '#FFFFFF',
    danger: '#D93036',
    dangerSoft: '#FDE5E6',
    success: '#2E9E62',
    scrim: 'rgba(8, 10, 14, 0.45)',
  },
  dark: {
    background: '#0A0C10',
    surface: '#151920',
    surfaceAlt: '#1D222B',
    surfacePressed: '#272D37',
    text: '#F2F4F8',
    textSecondary: '#A2ABBA',
    textTertiary: '#6D7685',
    border: '#262C36',
    me: '#5B8CFF',
    meSoft: '#18233F',
    them: '#FF7A45',
    themSoft: '#3A2017',
    onAccent: '#FFFFFF',
    danger: '#FF6B70',
    dangerSoft: '#3A1719',
    success: '#45D08A',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
};

export function accentFor(colors: Palette, speaker: Speaker) {
  return speaker === 'me'
    ? { accent: colors.me, soft: colors.meSoft }
    : { accent: colors.them, soft: colors.themSoft };
}

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  sm: 10,
  md: 16,
  lg: 22,
  pill: 999,
} as const;

export const MaxContentWidth = 720;
