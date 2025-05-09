import React from 'react';
import { Link } from 'react-router-dom';
import { ThemeToggle } from './theme-toggle';

interface NavbarProps {
  isAuthenticated?: boolean;
  onLogout?: () => void;
}

export function Navbar({ isAuthenticated, onLogout }: NavbarProps) {
  return (
    <header className="bg-white dark:bg-[#1d2021] border-b border-gray-200 dark:border-[#504945] sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex items-center">
            <Link to="/" className="flex items-center">
              <svg
                className="h-8 w-8 text-green-600 dark:text-[#b8bb26]"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
              <span className="ml-2 text-xl font-bold text-gray-900 dark:text-[#ebdbb2]">
                PasteShare
              </span>
            </Link>
          </div>

          <div className="flex items-center">
            <nav className="flex space-x-4 mr-4">
              <Link
                to="/"
                className="px-3 py-2 text-gray-600 dark:text-[#a89984] hover:text-gray-900 dark:hover:text-[#ebdbb2]"
              >
                Create
              </Link>
              <Link
                to="/pastes"
                className="px-3 py-2 text-gray-600 dark:text-[#a89984] hover:text-gray-900 dark:hover:text-[#ebdbb2]"
              >
                Explore
              </Link>
            </nav>
            <ThemeToggle />
          </div>
        </div>
      </div>
    </header>
  );
} 