import React, { createContext, useContext } from 'react';
import { useColorScheme } from 'react-native';
import { useAppStore } from '../store/useAppStore';

const light = {
  background: '#F6F7F9', surface: '#FFFFFF', surfaceAlt: '#F9FAFC', ink: '#252936',
  muted: '#858896', secondary: '#666B79', border: '#EAECF1', accent: '#8570D9',
  accentSoft: '#F0ECFA', green: '#3A8D79', greenSoft: '#EDF7F2', navy: '#292D42',
  red: '#CE6470', redSoft: '#FFF0F1', track: '#EEEDF5', isDark: false,
};
export type Theme = typeof light;
const dark: Theme = {
  background: '#141722', surface: '#1D2230', surfaceAlt: '#242A39', ink: '#EFF0F6',
  muted: '#9097AA', secondary: '#B2B7C8', border: '#303647', accent: '#B39AEF',
  accentSoft: '#352E49', green: '#8DD3B3', greenSoft: '#253D37', navy: '#292D42',
  red: '#EE9CA4', redSoft: '#422E36', track: '#333546', isDark: true,
};
const ThemeContext = createContext<Theme>(light);
export function ThemeProvider({ children }: React.PropsWithChildren) {
  const preference = useAppStore(s => s.preferences.theme);
  const system = useColorScheme();
  return <ThemeContext.Provider value={preference === 'dark' || (preference === 'system' && system === 'dark') ? dark : light}>{children}</ThemeContext.Provider>;
}
export const useTheme = () => useContext(ThemeContext);
export const font = { regular: 'DMSans_400Regular', medium: 'DMSans_500Medium', semibold: 'DMSans_600SemiBold', bold: 'Manrope_700Bold', display: 'Manrope_600SemiBold' };
