import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';
import { Navbar } from './components/navbar';
import { HomePage } from './pages/HomePage';
import { PastePage } from './pages/PastePage';
import { RecentPastesPage } from './pages/RecentPastesPage';

function App() {
  // Apply dark theme class to document on component mount to prevent flashing
  useEffect(() => {
    // Get theme from localStorage or use dark as default
    const storedTheme = localStorage.getItem('pasteshare-theme') || 'dark';
    document.documentElement.classList.add(storedTheme);
    
    // Set color scheme meta tag
    const meta = document.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = 'dark';
    document.head.appendChild(meta);
    
    return () => {
      document.head.removeChild(meta);
    };
  }, []);
  
  return (
    <ThemeProvider defaultTheme="dark">
      <Router>
        {/* Use flex column to create a layout with sticky footer */}
        <div className="flex flex-col min-h-screen bg-gray-100 dark:bg-[#282828]">
          <Navbar />
          
          {/* Make main content grow to fill available space */}
          <main className="flex-grow">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/paste/:id" element={<PastePage />} />
              <Route path="/recent" element={<RecentPastesPage />} />
            </Routes>
          </main>
          
          {/* Footer will stay at the bottom */}
          <footer className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm mt-auto border-t border-gray-200 dark:border-[#3c3836]">
            &copy; {new Date().getFullYear()} PasteShare. All rights reserved.
          </footer>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App; 