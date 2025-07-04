import React, { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
};

const initialState: ThemeProviderState = {
  theme: "light",
  setTheme: () => null,
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

// Add script to prevent theme flashing
const addThemeInitScript = () => {
  // Skip during SSR
  if (typeof window === 'undefined') return;
  
  // Check if script was already added
  if (document.getElementById('theme-init-script')) return;
  
  // Add a script to the head to set the theme immediately on page load
  const script = document.createElement('script');
  script.id = 'theme-init-script';
  script.innerHTML = `
    (function() {
      try {
        // Set light mode as default first
        document.documentElement.classList.add('light');
        document.documentElement.style.colorScheme = 'light';
        
        // Then check for saved preference
        const theme = localStorage.getItem('pasteshare-theme') || 'light';
        if (theme !== 'light') {
          document.documentElement.classList.remove('light');
          document.documentElement.classList.add(theme);
          document.documentElement.style.colorScheme = theme;
        }
      } catch (e) {
        console.error('Theme init error:', e);
        document.documentElement.classList.add('light');
      }
    })();
  `;
  
  // Insert at the beginning of head for earliest execution
  if (document.head.firstChild) {
    document.head.insertBefore(script, document.head.firstChild);
  } else {
    document.head.appendChild(script);
  }
};

// Call the script addition on module load
if (typeof window !== 'undefined') {
  // Use setTimeout to ensure this runs after the document is available
  setTimeout(addThemeInitScript, 0);
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  storageKey = "pasteshare-theme",
  ...props
}: ThemeProviderProps) {
  // Get initial theme from localStorage with a proper fallback
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window === 'undefined') return defaultTheme;
    return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;
    const body = window.document.body;
    
    // Remove all theme classes first
    root.classList.remove("light", "dark");
    body.classList.remove("light", "dark");
    
    let actualTheme = theme;
    if (theme === "system") {
      actualTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    }
    
    // Apply theme to both html and body for full coverage
    root.classList.add(actualTheme);
    body.classList.add(actualTheme);
    
    // Set color-scheme for proper browser styling
    root.style.colorScheme = actualTheme;
    
    // Ensure viewport meta tag for mobile with safe area support
    let viewportMeta = document.querySelector('meta[name="viewport"]');
    if (!viewportMeta) {
      viewportMeta = document.createElement('meta');
      viewportMeta.setAttribute('name', 'viewport');
      document.head.appendChild(viewportMeta);
    }
    viewportMeta.setAttribute('content', 'width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no');
    
  }, [theme]);

  const value = {
    theme,
    setTheme: (newTheme: Theme) => {
      localStorage.setItem(storageKey, newTheme);
      setTheme(newTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  
  if (context === undefined)
    throw new Error("useTheme must be used within a ThemeProvider");
  
  return context;
}; 