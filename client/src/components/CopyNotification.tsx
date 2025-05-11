import React, { useEffect } from 'react';

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
    <div className="fixed top-10 right-10 z-50 px-4 py-2 bg-gray-800 text-white text-sm rounded shadow-lg animate-fade-in">
      {message}
    </div>
  );
};

export default CopyNotification; 