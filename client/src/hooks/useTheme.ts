import { useState, useEffect } from 'react';

export function useTheme() {
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    // Check if dark mode is enabled in localStorage
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
      return savedTheme === 'dark';
    }
    
    // Check if user prefers dark mode
    if (typeof window !== 'undefined') {
      return window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
    
    return false;
  });

  useEffect(() => {
    // Check for dark mode preference changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    
    const handleChange = (e: MediaQueryListEvent) => {
      const newTheme = e.matches ? 'dark' : 'light';
      // Only update if the user hasn't manually set a preference
      if (!localStorage.getItem('theme')) {
        setIsDarkMode(e.matches);
        document.documentElement.classList.toggle('dark', e.matches);
      }
    };
    
    // Add listener for changes
    mediaQuery.addEventListener('change', handleChange);
    
    // Initial setup
    document.documentElement.classList.toggle('dark', isDarkMode);
    
    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, [isDarkMode]);

  const toggleTheme = () => {
    const newTheme = isDarkMode ? 'light' : 'dark';
    localStorage.setItem('theme', newTheme);
    setIsDarkMode(!isDarkMode);
    document.documentElement.classList.toggle('dark', !isDarkMode);
  };

  return { isDarkMode, toggleTheme };
} 