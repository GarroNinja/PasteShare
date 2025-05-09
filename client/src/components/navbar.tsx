import React from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "./theme-toggle";

interface NavbarProps {}

export function Navbar({}: NavbarProps) {
  const location = useLocation();

  return (
    <header className="bg-white dark:bg-[#1d2021] shadow">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-10">
            <Link to="/" className="flex items-center">
              <span className="text-green-600 dark:text-[#98971a] text-xl font-bold">
                PasteShare
              </span>
            </Link>

            <nav className="hidden md:flex items-center space-x-4">
              <Link
                to="/"
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  location.pathname === "/"
                    ? "bg-green-100 text-green-700 dark:bg-[#282828] dark:text-[#98971a]"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-[#b8bb26]"
                }`}
              >
                New Paste
              </Link>

              <Link
                to="/recent"
                className={`px-3 py-1 text-sm font-medium rounded-md ${
                  location.pathname === "/recent"
                    ? "bg-green-100 text-green-700 dark:bg-[#282828] dark:text-[#98971a]"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-[#b8bb26]"
                }`}
              >
                Recent Pastes
              </Link>
            </nav>
          </div>

          <div className="flex items-center">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
} 