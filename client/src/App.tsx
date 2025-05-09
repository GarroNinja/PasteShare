import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Navbar } from './components/navbar';
import { ThemeProvider } from './components/theme-provider';
import { HomePage } from './pages/HomePage';
import { PastePage } from './pages/PastePage';
import { RecentPastesPage } from './pages/RecentPastesPage';

function App() {
  // Auth state would be managed here, for now we'll just use a mock state
  const isAuthenticated = false;
  
  const handleLogout = () => {
    // Logout logic would go here
    console.log('Logging out...');
  };

  return (
    <ThemeProvider defaultTheme="dark">
      <Router>
        <div className="min-h-screen bg-gray-50 dark:bg-[#282828] text-gray-900 dark:text-[#ebdbb2]">
          <Navbar isAuthenticated={isAuthenticated} onLogout={handleLogout} />
          
          <main>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/paste/:id" element={<PastePage />} />
              <Route path="/pastes" element={<RecentPastesPage />} />
              {/* Add more routes as needed */}
            </Routes>
          </main>
          
          <footer className="py-6 border-t border-gray-200 dark:border-gray-800">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <p className="text-center text-gray-500 text-sm">
                &copy; {new Date().getFullYear()} PasteShare. All rights reserved.
              </p>
            </div>
          </footer>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App; 