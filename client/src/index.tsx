import React, { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import reportWebVitals from './reportWebVitals';

// Add function to mark the body as loaded
const markAsLoaded = () => {
  // Add a small delay to ensure styles are applied
  setTimeout(() => {
    document.body.classList.add('loaded');
  }, 50);
};

// Wrap App in a component that adds the loaded class
const AppWithLoadedClass = () => {
  useEffect(() => {
    markAsLoaded();
  }, []);
  
  return <App />;
};

const container = document.getElementById('root');
const root = createRoot(container!);
root.render(
  <React.StrictMode>
    <AppWithLoadedClass />
  </React.StrictMode>
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals(); 