import React, { useEffect, useState } from 'react';

interface CopyNotificationProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  buttonType: string;
}

const CopyNotification: React.FC<CopyNotificationProps> = ({ 
  message, 
  isVisible, 
  onClose,
  buttonType
}) => {
  const [isLightMode, setIsLightMode] = useState(false);
  
  useEffect(() => {
    // Check current theme
    const isDarkMode = document.documentElement.classList.contains('dark');
    setIsLightMode(!isDarkMode);
  }, []);
  
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);
  
  if (!isVisible) return null;
  
  return (
    <div className={`fixed top-10 right-10 z-50 px-4 py-2 text-sm rounded shadow-lg animate-fade-in ${
      isLightMode 
        ? 'bg-blue-600 text-white' 
        : 'bg-gray-800 text-white'
    }`}>
      {message}
    </div>
  );
};

export default CopyNotification; 