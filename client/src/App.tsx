import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ThemeProvider } from './components/ThemeProvider';
import { Navbar } from './components/Navbar';
import { HomePage } from './pages/HomePage';
import { PastePage } from './pages/PastePage';
import { RecentPastesPage } from './pages/RecentPastesPage';
import { RawPastePage } from './pages/RawPastePage';
import { globalContentValidation } from './components/CreatePasteForm';

// Mobile navigation component that shows at the bottom of the screen
function MobileNavBar() {
  const location = useLocation();
  
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white dark:bg-[#1d2021] border-t border-gray-200 dark:border-[#3c3836] py-2 px-4 z-50">
      <div className="flex justify-around items-center">
        <Link 
          to="/" 
          className={`flex flex-col items-center p-2 ${
            location.pathname === "/" 
              ? "text-green-700 dark:text-[#98971a]" 
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          <span className="text-xs mt-1">New</span>
        </Link>
        
        <Link 
          to="/recent" 
          className={`flex flex-col items-center p-2 ${
            location.pathname === "/recent" 
              ? "text-green-700 dark:text-[#98971a]" 
              : "text-gray-600 dark:text-gray-400"
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <span className="text-xs mt-1">Recent</span>
        </Link>
      </div>
    </div>
  );
}

function App() {
  // Initialize global content validation
  useEffect(() => {
    globalContentValidation();
  }, []);
  
  return (
    <ThemeProvider defaultTheme="light">
      <Router>
        {/* Use flex column to create a layout with sticky footer */}
        <div className="flex flex-col min-h-screen min-h-[100dvh] bg-white dark:bg-[#282828] w-full">
          <Navbar />
          
          {/* Make main content grow to fill available space */}
          <main className="flex-grow pb-16 md:pb-0"> {/* Add padding to bottom for mobile nav */}
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/raw/:id" element={<RawPastePage />} />
              <Route path="/recent" element={<RecentPastesPage />} />
              <Route path="/:id" element={<PastePage />} />
            </Routes>
          </main>
          
          {/* Mobile navigation */}
          <MobileNavBar />
          
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