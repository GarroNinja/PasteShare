import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/utils';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import CopyNotification from '../components/CopyNotification';
import { useTheme } from '../components/ThemeProvider';

interface Paste {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  views: number;
  isPrivate: boolean;
  customUrl?: string;
  isJupyterStyle?: boolean;
  isPasswordProtected?: boolean;
  blocks?: { language: string; content: string }[];
}

interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export function RecentPastesPage() {
  const [pastes, setPastes] = useState<Paste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<PaginationInfo | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const fetchedRef = useRef(false);
  
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  
  // Get the appropriate theme based on current mode
  const syntaxTheme = isDarkMode ? gruvboxDark : gruvboxLight;
  
  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationButtonType, setNotificationButtonType] = useState<'success' | 'error'>('success');

  // Simple language detection based on common patterns
  const detectLanguage = (content: string): string => {
    const firstLines = content.trim().split('\n').slice(0, 5).join('\n');
    
    // Check for common language patterns
    // C/C++ detection - should come before JavaScript to avoid misdetection
    if (firstLines.includes('#include <')) {
      // C++ specific patterns
      if (firstLines.includes('iostream') || 
          firstLines.includes('vector') || 
          firstLines.includes('namespace') ||
          firstLines.includes('template') || 
          firstLines.includes('std::') || 
          firstLines.includes('::') ||
          firstLines.includes('->') ||
          firstLines.includes('cout') ||
          firstLines.includes('cin') ||
          firstLines.match(/class\s+\w+\s*(\:\s*\w+\s*)?{/) ||
          firstLines.match(/void\s+\w+::\w+/) ||
          firstLines.match(/public:|private:|protected:/) ||
          firstLines.includes('new ') && firstLines.includes('delete ')) {
        return 'cpp';
      }
      // Plain C detection
      if (firstLines.includes('stdio.h') || 
          firstLines.includes('stdlib.h') || 
          (firstLines.includes('int main') && !firstLines.includes('class')) ||
          firstLines.includes('printf') ||
          firstLines.includes('scanf') ||
          firstLines.match(/struct\s+\w+\s*{/)) {
        return 'c';
      }
      return 'cpp'; // Default to cpp for other includes
    }
    
    // JavaScript detection - more specific patterns
    if (firstLines.includes('import React') || 
        firstLines.includes('export default') || 
        firstLines.includes('export const') ||
        firstLines.includes('const ') && (firstLines.includes(' = function') || firstLines.includes('=>')) ||
        firstLines.includes('let ') && (firstLines.includes(' = function') || firstLines.includes('=>')) ||
        firstLines.includes('var ') && (firstLines.includes(' = function') || firstLines.includes('=>')) ||
        (firstLines.includes('function') && (firstLines.includes('return') || firstLines.includes('this.'))) ||
        firstLines.includes('addEventListener') ||
        firstLines.includes('document.querySelector') ||
        firstLines.includes('window.') ||
        firstLines.includes('new Promise') ||
        firstLines.includes('async function') ||
        firstLines.includes('await ') ||
        firstLines.match(/console\.(log|error|warn)/) ||
        (firstLines.includes('{') && firstLines.includes('}') && 
          (firstLines.includes('function') || firstLines.includes('const ') || 
          firstLines.includes('let ') || firstLines.includes('return')))
      ) {
      return 'javascript';
    }
    if (firstLines.includes('import ') && firstLines.includes('from ') && (firstLines.includes('<') || firstLines.includes('interface'))) {
      return 'typescript';
    }
    if (firstLines.includes('class ') && firstLines.includes('public ') && firstLines.includes('void')) {
      return 'java';
    }
    if (firstLines.includes('def ') && firstLines.includes(':')) {
      return 'python';
    }
    if (firstLines.includes('<html') || firstLines.includes('<div') || firstLines.includes('</')) {
      return 'html';
    }
    // CSS detection (must come after JavaScript to avoid misdetection)
    if ((firstLines.includes('@media') || 
        firstLines.includes('color:') || 
        firstLines.includes('margin:') || 
        firstLines.includes('padding:') ||
        firstLines.includes('font-size:') ||
        firstLines.includes('.class') ||
        firstLines.includes('#id')) && 
        (firstLines.includes('{') && firstLines.includes('}'))) {
      return 'css';
    }
    if (firstLines.includes('<?php')) {
      return 'php';
    }
    if (firstLines.includes('package main') || firstLines.includes('func ')) {
      return 'go';
    }
    if (firstLines.includes('SELECT ') || firstLines.includes('FROM ')) {
      return 'sql';
    }
    if (firstLines.includes('#!/bin/bash') || firstLines.includes('#!/bin/sh')) {
      return 'bash';
    }
    // Kotlin detection
    if (firstLines.includes('fun ') || (firstLines.includes('val ') && firstLines.includes('var ')) || 
        (firstLines.includes('package ') && firstLines.includes('import ') && !firstLines.includes('golang'))) {
      return 'kotlin';
    }
    // Lua detection
    if ((firstLines.includes('function') && firstLines.includes('end')) || 
        (firstLines.includes('local ') && !firstLines.includes(';')) ||
        firstLines.includes('--[[') || (firstLines.match(/--[^\[]/) && firstLines.includes('then'))) {
      return 'lua';
    }
    
    // JSON detection
    if ((firstLines.startsWith('{') && firstLines.includes('"') && 
         (firstLines.includes('":') || firstLines.includes(': "'))) || 
        (firstLines.startsWith('[') && firstLines.includes('{') && 
         firstLines.includes('"') && firstLines.includes('":"'))) {
      return 'json';
    }
    
    // Default case
    return 'text';
  };

  // Helper function to truncate paste content
  const truncateContent = (content: string, maxLength = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  const copyLinkToClipboard = async (pasteId: string, customUrl: string | undefined, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const baseUrl = window.location.origin;
      const pasteUrl = `${baseUrl}/${customUrl || pasteId}`;
      await navigator.clipboard.writeText(pasteUrl);
      
      // Use the notification system instead of alert
      setNotificationButtonType('success');
      setNotificationMessage('Link copied to clipboard!');
      setShowNotification(true);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  const fetchPastes = async (page: number = 1) => {
    try {
      setLoading(true);
      setError(null);
      
      const data = await apiFetch(`pastes/recent?page=${page}`);
      
      // Check if the response has the expected structure
      if (data.pastes && Array.isArray(data.pastes)) {
        setPastes(data.pastes);
        setPagination(data.pagination);
      } else if (Array.isArray(data)) {
        // Fallback for old API format
        setPastes(data);
        setPagination(null);
      } else {
        setError("Invalid API response format");
      }
      
      setLoading(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to load pastes');
      setLoading(false);
    }
  };

  useEffect(() => {
    // Skip if we've already fetched data for this page
    if (fetchedRef.current && currentPage === 1) return;
    
    fetchedRef.current = true;
    fetchPastes(currentPage);
  }, [currentPage]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    fetchedRef.current = false; // Allow refetch for new page
  };

  // Common wrapper for consistent minimum height
  const PageWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
      <h1 className="text-2xl font-bold mb-6">Recent Pastes</h1>
      {children}
    </div>
  );

  const renderPasteContent = (paste: Paste) => {
    // For password-protected pastes, show a placeholder
    if (paste.isPasswordProtected) {
      return (
        <div className="flex items-center justify-center h-24 bg-gray-100 dark:bg-[#3c3836] rounded border-2 border-dashed border-gray-300 dark:border-[#504945]">
          <div className="text-center">
            <svg className="w-8 h-8 mx-auto mb-2 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            <p className="text-sm text-gray-500 dark:text-gray-400">Password Protected</p>
            <p className="text-xs text-gray-400 dark:text-gray-500">Click to view content</p>
          </div>
        </div>
      );
    }

    // For Jupyter-style pastes with blocks, show blocks content
    if (paste.isJupyterStyle && paste.blocks && paste.blocks.length > 0) {
      // Show just the first block or a combined preview
      const firstBlock = paste.blocks[0];
      const previewContent = firstBlock ? firstBlock.content : '';
      
      return (
        <SyntaxHighlighter
          language={firstBlock ? firstBlock.language : 'text'}
          style={syntaxTheme}
          customStyle={{ 
            maxHeight: '200px', 
            overflow: 'hidden',
          }}
        >
          {previewContent}
        </SyntaxHighlighter>
      );
    }
    
    // Standard paste - show regular content
    return (
      <SyntaxHighlighter
        language={detectLanguage(paste.content)}
        style={syntaxTheme}
        customStyle={{ 
          maxHeight: '200px', 
          overflow: 'hidden',
        }}
      >
        {paste.content}
      </SyntaxHighlighter>
    );
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="animate-pulse">
              <div className="h-24 bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] p-4">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mb-4"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              </div>
            </div>
          ))}
        </div>
      </PageWrapper>
    );
  }

  if (error) {
    return (
      <PageWrapper>
        <div className="bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      {showNotification && (
        <CopyNotification 
          message={notificationMessage}
          isVisible={showNotification}
          onClose={() => setShowNotification(false)}
          buttonType={notificationButtonType}
        />
      )}
      
      {pastes.length === 0 ? (
        <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No pastes available.</p>
          <Link
            to="/"
            className="inline-block mt-4 px-4 py-2 bg-green-600 !bg-green-600 text-white hover:bg-green-700 rounded-md border-transparent dark:!bg-[#98971a] dark:!text-[#1d2021] dark:hover:!bg-[#79740e]"
          >
            Create New Paste
          </Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {pastes.map(paste => (
              <div key={paste.id} className="relative block">
                <Link
                  to={`/${paste.customUrl || paste.id}`}
                  className="block bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] hover:border-green-300 dark:hover:border-[#98971a] transition-colors"
                >
                  <div className="p-4">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2 gap-2">
                      <div className="flex items-center gap-2 mb-2 sm:mb-0 min-w-0 flex-1 overflow-hidden">
                        <h2 className="text-lg font-medium truncate min-w-0">{paste.title || 'Untitled Paste'}</h2>
                        {paste.isPasswordProtected && (
                          <svg className="w-4 h-4 text-blue-500 dark:text-blue-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                          </svg>
                        )}
                        {paste.isJupyterStyle && (
                          <span className="px-2 py-0.5 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full text-xs flex-shrink-0">
                            Jupyter
                          </span>
                        )}
                      </div>
                      <button
                        onClick={(e) => copyLinkToClipboard(paste.id, paste.customUrl, e)}
                        className="absolute top-4 right-4 sm:static sm:ml-2 sm:flex-shrink-0 px-3 py-1 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 z-10"
                      >
                        Copy Link
                      </button>
                    </div>
                    <div className="overflow-hidden rounded" style={{
                      backgroundColor: isDarkMode 
                        ? '#1d2021'  // Dark background for dark mode
                        : '#f9f9f9'  // Light background for light mode
                    }}>
                      {renderPasteContent(paste)}
                    </div>
                    <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>Created: {new Date(paste.createdAt).toLocaleString()}</span>
                      <div className="flex items-center gap-2">
                        {paste.customUrl && (
                          <span className="px-2 py-0.5 bg-green-100 dark:bg-[#282828] text-green-800 dark:text-[#98971a] rounded-full">
                            {paste.customUrl}
                          </span>
                        )}
                        <span>{paste.views} views</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {pagination && pagination.totalPages > 1 && (
            <div className="mt-8 flex justify-center">
              <div className="flex items-center space-x-2">
                {/* Previous button */}
                <button
                  onClick={() => handlePageChange(currentPage - 1)}
                  disabled={!pagination.hasPrevPage}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pagination.hasPrevPage
                      ? 'bg-white dark:bg-[#282828] text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-[#504945] hover:bg-gray-50 dark:hover:bg-[#3c3836]'
                      : 'bg-gray-100 dark:bg-[#3c3836] text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-[#504945] cursor-not-allowed'
                  }`}
                >
                  Previous
                </button>

                {/* Page numbers */}
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => {
                  // Show first page, last page, current page, and pages around current page
                  const showPage = page === 1 || 
                                   page === pagination.totalPages || 
                                   Math.abs(page - currentPage) <= 1;
                  
                  if (!showPage) {
                    // Show ellipsis for gaps
                    if (page === 2 && currentPage > 4) {
                      return <span key={page} className="px-2 text-gray-400">...</span>;
                    }
                    if (page === pagination.totalPages - 1 && currentPage < pagination.totalPages - 3) {
                      return <span key={page} className="px-2 text-gray-400">...</span>;
                    }
                    return null;
                  }

                  return (
                    <button
                      key={page}
                      onClick={() => handlePageChange(page)}
                      className={`px-3 py-2 rounded-md text-sm font-medium ${
                        page === currentPage
                          ? 'bg-green-600 text-white dark:bg-[#98971a] dark:text-[#1d2021]'
                          : 'bg-white dark:bg-[#282828] text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-[#504945] hover:bg-gray-50 dark:hover:bg-[#3c3836]'
                      }`}
                    >
                      {page}
                    </button>
                  );
                })}

                {/* Next button */}
                <button
                  onClick={() => handlePageChange(currentPage + 1)}
                  disabled={!pagination.hasNextPage}
                  className={`px-3 py-2 rounded-md text-sm font-medium ${
                    pagination.hasNextPage
                      ? 'bg-white dark:bg-[#282828] text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-[#504945] hover:bg-gray-50 dark:hover:bg-[#3c3836]'
                      : 'bg-gray-100 dark:bg-[#3c3836] text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-[#504945] cursor-not-allowed'
                  }`}
                >
                  Next
                </button>
              </div>
            </div>
          )}

          {/* Pagination info */}
          {pagination && (
            <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
              Showing {((currentPage - 1) * 5) + 1} to {Math.min(currentPage * 5, pagination.totalCount)} of {pagination.totalCount} pastes
            </div>
          )}
        </>
      )}
    </PageWrapper>
  );
}