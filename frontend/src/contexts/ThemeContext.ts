import { createContext } from 'react';
export type Theme = 'light' | 'dark';
export interface ThemeContextShape { theme: Theme; toggle: ()=>void; setTheme: (t:Theme)=>void; }
export const ThemeContext = createContext<ThemeContextShape | undefined>(undefined);
