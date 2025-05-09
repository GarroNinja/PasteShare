import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './components/theme-provider';
import { Navbar } from './components/navbar';
import { HomePage } from './pages/HomePage';
import { PastePage } from './pages/PastePage';
import { RecentPastesPage } from './pages/RecentPastesPage';

function App() {
  return (
    <ThemeProvider defaultTheme="dark">
      <Router>
        <div className="min-h-screen bg-gray-100 dark:bg-[#282828]">
          <Navbar />
          
          <main className="pb-16">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/paste/:id" element={<PastePage />} />
              <Route path="/recent" element={<RecentPastesPage />} />
            </Routes>
          </main>
          
          <footer className="py-4 text-center text-gray-500 dark:text-gray-400 text-sm">
            &copy; {new Date().getFullYear()} PasteShare. All rights reserved.
          </footer>
        </div>
      </Router>
    </ThemeProvider>
  );
}

export default App; 