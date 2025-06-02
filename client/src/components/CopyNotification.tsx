import React, { useEffect } from 'react';

interface CopyNotificationProps {
  message: string;
  isVisible: boolean;
  onClose: () => void;
  buttonType: 'success' | 'error';
}

export default function CopyNotification({ message, isVisible, onClose, buttonType }: CopyNotificationProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, 3000);
      
      return () => {
        clearTimeout(timer);
      };
    }
  }, [isVisible, onClose]);
  
  if (!isVisible) return null;
  
  const bgColor = buttonType === 'success' 
    ? 'bg-green-100 dark:bg-green-900/30' 
    : 'bg-red-100 dark:bg-red-900/30';
  
  const textColor = buttonType === 'success'
    ? 'text-green-800 dark:text-green-300'
    : 'text-red-800 dark:text-red-300';
  
  const iconColor = buttonType === 'success'
    ? 'text-green-500 dark:text-green-400'
    : 'text-red-500 dark:text-red-400';
  
  return (
    <div className={`fixed top-4 right-4 z-50 py-2 px-4 rounded-md shadow-md flex items-center ${bgColor} ${textColor}`}>
      <span className={`mr-2 ${iconColor}`}>
        {buttonType === 'success' ? (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
        )}
      </span>
      <span>{message}</span>
    </div>
  );
} 