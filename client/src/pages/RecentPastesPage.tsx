import React, { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/utils';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { gruvboxDark } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import CopyNotification from '../components/CopyNotification';

interface Paste {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  views: number;
  isPrivate: boolean;
  customUrl?: string;
}

export function RecentPastesPage() {
  const [pastes, setPastes] = useState<Paste[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  
  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationButtonType, setNotificationButtonType] = useState('');

  // Simple language detection based on common patterns
  const detectLanguage = (content: string): string => {
    const firstLines = content.trim().split('\n').slice(0, 5).join('\n');
    
    // Check for common language patterns
    // JavaScript detection - more specific patterns first
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
    if (firstLines.includes('#include <')) {
      if (firstLines.includes('iostream') || firstLines.includes('vector') || firstLines.includes('namespace')) {
        return 'cpp';
      }
      // Plain C detection
      if (firstLines.includes('stdio.h') || firstLines.includes('stdlib.h') || (firstLines.includes('int main') && !firstLines.includes('class'))) {
        return 'c';
      }
      return 'cpp'; // Default to cpp for other includes
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
      const pasteUrl = `${baseUrl}/paste/${customUrl || pasteId}`;
      await navigator.clipboard.writeText(pasteUrl);
      
      // Use the notification system instead of alert
      setNotificationButtonType('link');
      setNotificationMessage('Link copied to clipboard!');
      setShowNotification(true);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };

  useEffect(() => {
    // Skip if we've already fetched data
    if (fetchedRef.current) return;
    
    fetchedRef.current = true;
    
    const fetchPastes = async () => {
      try {
        const data = await apiFetch('pastes');
        
        // Check if the response has the expected structure
        console.log("Recent pastes response:", data);
        
        if (Array.isArray(data)) {
          setPastes(data);
        } else if (data.pastes && Array.isArray(data.pastes)) {
          setPastes(data.pastes);
        } else {
          console.error("Invalid API response structure:", data);
          setError("Invalid API response format");
        }
        
        setLoading(false);
      } catch (error) {
        console.error('Error fetching pastes:', error);
        setError(error instanceof Error ? error.message : 'Failed to load pastes');
        setLoading(false);
      }
    };

    fetchPastes();
  }, []);

  // Common wrapper for consistent minimum height
  const PageWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
      <h1 className="text-2xl font-bold mb-6">Recent Pastes</h1>
      {children}
    </div>
  );

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
        <div className="space-y-4">
          {pastes.map(paste => (
            <div key={paste.id} className="relative block">
              <Link
                to={`/paste/${paste.customUrl || paste.id}`}
                className="block bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] hover:border-green-300 dark:hover:border-[#98971a] transition-colors"
              >
                <div className="p-4">
                  <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start mb-2">
                    <h2 className="text-lg font-medium mb-2 sm:mb-0 pr-20 sm:pr-0 truncate max-w-full">{paste.title || 'Untitled Paste'}</h2>
                    <button
                      onClick={(e) => copyLinkToClipboard(paste.id, paste.customUrl, e)}
                      className="absolute top-4 right-4 sm:static sm:ml-2 sm:flex-shrink-0 px-3 py-1 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50 z-10"
                    >
                      Copy Link
                    </button>
                  </div>
                  <div className="overflow-hidden rounded" style={{backgroundColor: '#1d2021'}}>
                    <SyntaxHighlighter
                      language={detectLanguage(paste.content)}
                      style={gruvboxDark}
                      customStyle={{
                        margin: 0,
                        padding: '0.5rem',
                        fontSize: '0.75rem',
                        height: '40px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                        backgroundColor: 'transparent',
                        borderRadius: 0
                      }}
                      className="syntax-highlighter-override"
                    >
                      {truncateContent(paste.content)}
                    </SyntaxHighlighter>
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
      )}
    </PageWrapper>
  );
} 