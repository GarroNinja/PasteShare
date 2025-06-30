import React, { useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ThemeToggle } from "./ThemeToggle";

export function Navbar() {
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <header className="bg-white dark:bg-[#1d2021] shadow">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-10">
            <Link to="/" className="flex items-center">
              <img 
                src="/favicon.svg" 
                alt="PasteShare Logo" 
                className="h-6 w-6 mr-2" 
              />
              <span className="text-green-600 dark:text-[#98971a] text-xl font-bold">
                PasteShare
              </span>
            </Link>

            {/* Desktop navigation */}
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

          <div className="flex items-center space-x-4">
            <ThemeToggle />
            
            {/* Mobile menu button */}
            <button 
              onClick={toggleMobileMenu}
              className="md:hidden p-2 rounded-md text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-[#3c3836] focus:outline-none"
              aria-label="Toggle mobile menu"
            >
              <svg 
                xmlns="http://www.w3.org/2000/svg" 
                className="h-6 w-6" 
                fill="none" 
                viewBox="0 0 24 24" 
                stroke="currentColor"
              >
                {mobileMenuOpen ? (
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M6 18L18 6M6 6l12 12" 
                  />
                ) : (
                  <path 
                    strokeLinecap="round" 
                    strokeLinejoin="round" 
                    strokeWidth={2} 
                    d="M4 6h16M4 12h16M4 18h16" 
                  />
                )}
              </svg>
            </button>
          </div>
        </div>
        
        {/* Mobile navigation menu */}
        {mobileMenuOpen && (
          <nav className="md:hidden mt-3 pt-3 border-t border-gray-200 dark:border-[#3c3836]">
            <div className="flex flex-col space-y-2">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  location.pathname === "/"
                    ? "bg-green-100 text-green-700 dark:bg-[#282828] dark:text-[#98971a]"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-[#b8bb26]"
                }`}
              >
                New Paste
              </Link>

              <Link
                to="/recent"
                onClick={() => setMobileMenuOpen(false)}
                className={`px-3 py-2 text-sm font-medium rounded-md ${
                  location.pathname === "/recent"
                    ? "bg-green-100 text-green-700 dark:bg-[#282828] dark:text-[#98971a]"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-300 dark:hover:text-[#b8bb26]"
                }`}
              >
                Recent Pastes
              </Link>
            </div>
          </nav>
        )}
      </div>
    </header>
  );
} 