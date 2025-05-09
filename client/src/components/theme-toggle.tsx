import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  const toggleTheme = () => {
    setTheme(theme === "light" ? "dark" : "light");
    console.log("Theme toggled to:", theme === "light" ? "dark" : "light");
  };

  return (
    <button
      onClick={toggleTheme}
      className="p-2 rounded-full bg-gray-200 dark:bg-[#3c3836] hover:bg-gray-300 dark:hover:bg-[#504945] transition-colors"
      aria-label={`Change theme to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-[#fabd2f]" />
      ) : (
        <Moon className="h-5 w-5 text-green-700" />
      )}
    </button>
  );
} 