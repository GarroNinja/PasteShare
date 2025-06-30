import React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();

  return (
    <button
      onClick={() => setTheme(theme === "light" ? "dark" : "light")}
      className="p-2 rounded-full bg-gray-200 dark:bg-[#3c3836] hover:bg-gray-300 dark:hover:bg-[#504945] transition-colors"
      aria-label={`Change theme to ${theme === "light" ? "dark" : "light"} mode`}
    >
      {theme === "dark" ? (
        <Sun className="h-5 w-5 text-[#fabd2f]" />
      ) : (
        <Moon className="h-5 w-5 text-[#79740e]" />
      )}
    </button>
  );
} 