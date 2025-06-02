import React, { ReactNode } from 'react';

interface PageWrapperProps {
  children: ReactNode;
}

export function PageWrapper({ children }: PageWrapperProps) {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-[#1d2021] text-gray-900 dark:text-[#ebdbb2]">
      {children}
    </div>
  );
} 