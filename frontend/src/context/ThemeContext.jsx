import { createContext, useContext, useEffect, useState } from 'react';

const ThemeContext = createContext(null);

// Dark is the default. 'system' follows the OS; the choice is remembered per browser.
const getInitialMode = () => {
  const stored = localStorage.getItem('theme');
  return stored === 'light' || stored === 'system' ? stored : 'dark';
};

const systemDark = () => window.matchMedia('(prefers-color-scheme: dark)').matches;

export function ThemeProvider({ children }) {
  const [mode, setMode] = useState(getInitialMode);
  const [osDark, setOsDark] = useState(systemDark);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const on = (e) => setOsDark(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const theme = mode === 'system' ? (osDark ? 'dark' : 'light') : mode;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('theme', mode);
  }, [theme, mode]);

  const toggleTheme = () => setMode(theme === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
