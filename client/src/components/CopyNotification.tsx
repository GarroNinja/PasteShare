import React, { useState, useEffect } from 'react';

interface CopyNotificationProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
}

const CopyNotification: React.FC<CopyNotificationProps> = ({ message, isVisible, onClose }) => {
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
    <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-2 px-3 py-1 bg-gray-800 dark:bg-gray-700 text-white text-sm rounded shadow-lg z-20 whitespace-nowrap">
      {message}
      <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 w-0 h-0 border-l-[6px] border-r-[6px] border-b-[6px] border-l-transparent border-r-transparent border-b-gray-800 dark:border-b-gray-700"></div>
    </div>
  );
};

export default CopyNotification; 