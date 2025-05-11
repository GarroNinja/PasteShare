import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl, apiFetch } from '../lib/utils';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { 
  a11yDark, a11yLight, agate, anOldHope, androidstudio, 
  arduinoLight, atomOneDark, atomOneLight, 
  dracula, docco, darcula, far, github, googlecode,
  gruvboxDark, gruvboxLight, hopscotch, hybrid, 
  monokai, monokaiSublime, nord, obsidian, 
  ocean, paraisoDark, railscasts, solarizedDark, solarizedLight,
  tomorrowNight, vs, vs2015, xcode, xt256, zenburn
} from 'react-syntax-highlighter/dist/esm/styles/hljs';
import CopyNotification from '../components/CopyNotification';

interface File {
  id: string;
  filename: string;
  size: number;
  url: string;
  mimetype?: string;
}

interface Paste {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  expiresAt: string | null;
  isPrivate: boolean;
  isEditable?: boolean;
  customUrl?: string;
  views?: number;
  files?: File[];
  canEdit?: boolean;
  updatedAt?: string;
}

export function PastePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [paste, setPaste] = useState<Paste | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableTitle, setEditableTitle] = useState('');
  const [editableContent, setEditableContent] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string | null>(null);
  const [theme, setTheme] = useState(gruvboxDark);
  
  // Notification state
  const [showCopyNotification, setShowCopyNotification] = useState(false);
  const [copyNotificationMessage, setCopyNotificationMessage] = useState('');
  const [copyNotificationPosition, setCopyNotificationPosition] = useState({ top: 0, left: 0 });
  const [notificationTarget, setNotificationTarget] = useState<HTMLElement | null>(null);

  // Auto-detect language based on content
  useEffect(() => {
    if (paste?.content) {
      const detectedLanguage = detectLanguage(paste.content);
      setLanguage(detectedLanguage);
    }
  }, [paste?.content]);

  // Simple language detection based on common patterns
  const detectLanguage = (content: string): string => {
    const firstLines = content.trim().split('\n').slice(0, 10).join('\n');
    
    // Check for common language patterns
    if (firstLines.includes('import React') || firstLines.includes('export default') || (firstLines.includes('function') && firstLines.includes('const'))) {
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
    if ((firstLines.includes('@media') || firstLines.includes('color:')) || (firstLines.includes('{') && firstLines.includes('}'))) {
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
    
    // Default case
    return 'text';
  };

  // List of available themes
  const availableThemes = [
    // Light themes
    { name: 'VS Code Light', value: vs },
    { name: 'GitHub', value: github },
    { name: 'Xcode', value: xcode },
    { name: 'Arduino Light', value: arduinoLight },
    { name: 'Atom One Light', value: atomOneLight },
    { name: 'Google Code', value: googlecode },
    { name: 'Solarized Light', value: solarizedLight },
    { name: 'A11y Light', value: a11yLight },
    { name: 'Gruvbox Light', value: gruvboxLight },
    // Dark themes
    { name: 'VS Code Dark', value: vs2015 },
    { name: 'Atom One Dark', value: atomOneDark },
    { name: 'Dracula', value: dracula },
    { name: 'Monokai', value: monokai },
    { name: 'Monokai Sublime', value: monokaiSublime },
    { name: 'Gruvbox Dark', value: gruvboxDark },
    { name: 'Nord', value: nord },
    { name: 'Solarized Dark', value: solarizedDark },
    { name: 'Tomorrow Night', value: tomorrowNight },
    { name: 'Darcula (JetBrains)', value: darcula },
    { name: 'A11y Dark', value: a11yDark },
    { name: 'Agate', value: agate },
    { name: 'Android Studio', value: androidstudio },
    { name: 'An Old Hope', value: anOldHope },
    { name: 'Far', value: far },
    { name: 'Hopscotch', value: hopscotch },
    { name: 'Hybrid', value: hybrid },
    { name: 'Obsidian', value: obsidian },
    { name: 'Ocean', value: ocean },
    { name: 'Paraiso Dark', value: paraisoDark },
    { name: 'Railscasts', value: railscasts },
    { name: 'XT256', value: xt256 },
    { name: 'Zenburn', value: zenburn }
  ];

  // List of common languages for manual selection
  const commonLanguages = [
    'text', 'javascript', 'typescript', 'python', 'java', 'cpp', 'csharp', 'c',
    'ruby', 'go', 'php', 'html', 'css', 'xml', 'json', 'yaml', 'markdown',
    'sql', 'bash', 'powershell', 'rust', 'kotlin', 'lua'
  ];

  useEffect(() => {
    // Skip if we've already fetched data with the same ID
    if (fetchedRef.current) return;
    
    fetchedRef.current = true;
    
    const fetchPaste = async () => {
      if (!id) {
        setError("No paste ID provided");
        setLoading(false);
        return;
      }

      try {
        const data = await apiFetch(`pastes/${id}`);
        
        // Check if the response has the expected structure
        console.log("Paste response:", data);
        
        if (data.paste) {
          // Use the correct path from the API response
          setPaste(data.paste);
          // Also set the editable fields
          setEditableTitle(data.paste.title || '');
          setEditableContent(data.paste.content || '');
        } else {
          console.error("Invalid API response structure:", data);
          setError("Invalid API response format");
        }
        
        setLoading(false);
      } catch (err) {
        console.error("Error fetching paste:", err);
        setError("Failed to load paste. Please try again later.");
        setLoading(false);
      }
    };

    fetchPaste();
  }, [id]);

  const copyToClipboard = async (text: string, event: React.MouseEvent<HTMLButtonElement>) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotificationTarget(event.currentTarget);
      setCopyNotificationMessage('Copied to clipboard!');
      setShowCopyNotification(true);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };
  
  const copyLinkToClipboard = async (event: React.MouseEvent<HTMLButtonElement>) => {
    try {
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      setNotificationTarget(event.currentTarget);
      setCopyNotificationMessage('Link copied to clipboard!');
      setShowCopyNotification(true);
    } catch (err) {
      console.error("Failed to copy link:", err);
    }
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    // Map extensions to emoji icons
    const iconMap: Record<string, string> = {
      pdf: '📄',
      doc: '📝',
      docx: '📝',
      xls: '📊',
      xlsx: '📊',
      ppt: '📊',
      pptx: '📊',
      txt: '📝',
      jpg: '🖼️',
      jpeg: '🖼️',
      png: '🖼️',
      gif: '🖼️',
      zip: '📦',
      rar: '📦',
      '7z': '📦',
      mp3: '🎵',
      mp4: '🎬',
      json: '📋',
      xml: '📋',
      html: '📋',
      css: '📋',
      js: '📋',
      ts: '📋',
      py: '📋',
      java: '📋',
      c: '📋',
      cpp: '📋',
      kt: '📋',
      kts: '📋',
      lua: '📋',
    };
    
    return iconMap[extension] || '📎';
  };
  
  const handleFileDownload = async (file: File, event: React.MouseEvent) => {
    event.preventDefault();
    
    try {
      setDownloadError(null);
      
      // Construct the full URL for the file - fix the URL by removing any duplicate /api/ prefix
      const apiBaseUrl = getApiBaseUrl();
      const cleanFileUrl = file.url.startsWith('/api/') ? file.url.substring(4) : file.url;
      const fileUrl = `${apiBaseUrl}${cleanFileUrl}`;
      
      console.log("Downloading file from:", fileUrl);
      
      // Use fetch to get the file with proper credentials and mode
      const response = await fetch(fileUrl, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Accept': '*/*',
        }
      });
      
      console.log(`Download response: status=${response.status}, content-type=${response.headers.get('content-type')}`);
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      console.log("Download blob:", blob.type, blob.size);
      
      // Create an object URL for the blob
      const url = window.URL.createObjectURL(blob);
      
      // Create a temporary link element to trigger the download
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = file.filename; // Use the original filename for the download
      document.body.appendChild(a);
      
      // Trigger the download
      a.click();
      
      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      console.log("Download initiated successfully");
    } catch (err) {
      console.error('File download error:', err);
      setDownloadError(`Failed to download file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  const handleEdit = () => {
    if (paste?.canEdit) {
      setIsEditMode(true);
    }
  };
  
  const handleCancelEdit = () => {
    setIsEditMode(false);
    setEditableTitle(paste?.title || '');
    setEditableContent(paste?.content || '');
    setEditError(null);
  };
  
  const handleSaveEdit = async () => {
    if (!paste) return;
    
    setEditLoading(true);
    setEditError(null);
    
    try {
      const data = await apiFetch(`pastes/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editableTitle,
          content: editableContent,
        }),
      });
      
      console.log("Paste updated successfully:", data);
      
      // Update the paste with the new data
      if (data.paste) {
        setPaste({
          ...paste,
          title: data.paste.title,
          content: data.paste.content,
          updatedAt: data.paste.updatedAt,
        });
      }
      
      setIsEditMode(false);
    } catch (err) {
      console.error("Error updating paste:", err);
      setEditError(err instanceof Error ? err.message : 'Failed to update paste');
    } finally {
      setEditLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mx-auto mb-4"></div>
          <div className="h-64 bg-gray-200 dark:bg-gray-700 rounded mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4 mx-auto"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
        <div className="bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-300">{error}</p>
          <button 
            onClick={() => navigate('/')}
            className="mt-4 px-4 py-2 bg-green-600 !bg-green-600 text-white hover:bg-green-700 rounded-md border-transparent dark:!bg-[#98971a] dark:!text-[#1d2021] dark:hover:!bg-[#79740e]"
          >
            Create New Paste
          </button>
        </div>
      </div>
    );
  }

  if (!paste) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
        <p>Paste not found or has expired.</p>
        <button 
          onClick={() => navigate('/')}
          className="mt-4 px-4 py-2 bg-green-600 !bg-green-600 text-white hover:bg-green-700 rounded-md border-transparent dark:!bg-[#98971a] dark:!text-[#1d2021] dark:hover:!bg-[#79740e]"
        >
          Create New Paste
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
      <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] overflow-hidden mb-4">
        <div className="p-4 border-b border-gray-200 dark:border-[#3c3836] flex flex-col sm:flex-row sm:justify-between sm:items-center">
          {isEditMode ? (
            <input
              type="text"
              value={editableTitle}
              onChange={(e) => setEditableTitle(e.target.value)}
              placeholder="Untitled Paste"
              className="text-xl font-semibold bg-white dark:bg-[#282828] border border-gray-300 dark:border-gray-600 rounded px-2 py-1 w-full sm:w-2/3"
            />
          ) : (
            <h1 className="text-xl font-semibold mb-3 sm:mb-0 truncate max-w-full">{paste.title || 'Untitled Paste'}</h1>
          )}
          
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0 sm:flex-shrink-0">
            {!isEditMode && paste && (
              <>
                <div className="relative">
                  <button 
                    onClick={(e) => copyToClipboard(paste.content, e)}
                    className="px-3 py-1 text-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                  >
                    Copy
                  </button>
                  {showCopyNotification && notificationTarget?.textContent === 'Copy' && (
                    <CopyNotification 
                      message={copyNotificationMessage}
                      isVisible={showCopyNotification}
                      onClose={() => setShowCopyNotification(false)}
                    />
                  )}
                </div>
                <div className="relative">
                  <button 
                    onClick={copyLinkToClipboard}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                  >
                    Copy Link
                  </button>
                  {showCopyNotification && notificationTarget?.textContent === 'Copy Link' && (
                    <CopyNotification 
                      message={copyNotificationMessage}
                      isVisible={showCopyNotification}
                      onClose={() => setShowCopyNotification(false)}
                    />
                  )}
                </div>
                <button 
                  onClick={() => window.print()}
                  className="px-3 py-1 text-sm bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                >
                  Print
                </button>
                {paste.canEdit && (
                  <button 
                    onClick={handleEdit}
                    className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300 rounded hover:bg-yellow-200 dark:hover:bg-yellow-900/50"
                  >
                    Edit
                  </button>
                )}
              </>
            )}
            
            {isEditMode && (
              <>
                <button 
                  onClick={handleSaveEdit}
                  disabled={editLoading}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                >
                  {editLoading ? 'Saving...' : 'Save'}
                </button>
                <button 
                  onClick={handleCancelEdit}
                  disabled={editLoading}
                  className="px-3 py-1 text-sm bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 rounded hover:bg-red-200 dark:hover:bg-red-900/50"
                >
                  Cancel
                </button>
              </>
            )}
          </div>
        </div>
        
        {isEditMode ? (
          <div className="p-4 bg-gray-50 dark:bg-[#1d2021]">
            <textarea
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              rows={15}
              className="w-full font-mono text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#3c3836] rounded p-2 text-gray-800 dark:text-gray-200"
            ></textarea>
            {editError && (
              <p className="mt-2 text-sm text-red-600 dark:text-red-400">{editError}</p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between bg-gray-100 dark:bg-[#282828] p-2 border-b border-gray-200 dark:border-[#3c3836]">
              <div className="flex items-center space-x-2">
                <label htmlFor="language-select" className="text-sm text-gray-600 dark:text-gray-400">
                  Language:
                </label>
                <select 
                  id="language-select"
                  value={language || 'text'}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#3c3836] rounded px-2 py-1"
                >
                  {commonLanguages.map(lang => (
                    <option key={lang} value={lang}>{lang}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center space-x-2">
                <label htmlFor="theme-select" className="text-sm text-gray-600 dark:text-gray-400">
                  Theme:
                </label>
                <select 
                  id="theme-select"
                  value={availableThemes.findIndex(t => t.value === theme)}
                  onChange={(e) => setTheme(availableThemes[parseInt(e.target.value)].value)}
                  className="text-sm border border-gray-300 dark:border-gray-600 bg-white dark:bg-[#3c3836] rounded px-2 py-1"
                >
                  <optgroup label="Light Themes">
                    {availableThemes.slice(0, 9).map((theme, index) => (
                      <option key={index} value={index}>{theme.name}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Dark Themes">
                    {availableThemes.slice(9).map((theme, index) => (
                      <option key={index + 9} value={index + 9}>{theme.name}</option>
                    ))}
                  </optgroup>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto" style={{backgroundColor: theme === vs || theme === xcode || theme === github || theme === atomOneLight || theme === arduinoLight || theme === googlecode || theme === solarizedLight || theme === a11yLight || theme === gruvboxLight ? '#f8f8f8' : '#1d2021'}}>
              <SyntaxHighlighter
                language={language || 'text'}
                style={theme}
                customStyle={{
                  margin: 0,
                  padding: '1rem',
                  fontSize: '0.875rem',
                  backgroundColor: 'transparent',
                  borderRadius: 0
                }}
                wrapLongLines={false}
                className="syntax-highlighter-override"
              >
                {paste.content}
              </SyntaxHighlighter>
            </div>
          </>
        )}
        
        <div className="p-3 bg-gray-50 dark:bg-[#1d2021] text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-[#3c3836]">
          <p>Created: {new Date(paste.createdAt).toLocaleString()}</p>
          {paste.expiresAt && (
            <p>Expires: {new Date(paste.expiresAt).toLocaleString()}</p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-1">
            {paste.isPrivate && (
              <span className="inline-flex items-center px-2 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-full text-xs">
                Private
              </span>
            )}
            
            {paste.isEditable && (
              <span className="inline-flex items-center px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-full text-xs">
                Editable
              </span>
            )}
            
            {paste.customUrl && (
              <span className="inline-flex items-center px-2 py-1 bg-purple-100 dark:bg-purple-900/20 text-purple-800 dark:text-purple-300 rounded-full text-xs">
                Custom URL: {paste.customUrl}
              </span>
            )}
            
            {paste.views !== undefined && (
              <span className="inline-flex items-center px-2 py-1 bg-gray-100 dark:bg-[#3c3836] text-gray-700 dark:text-gray-300 rounded-full text-xs">
                Views: {paste.views}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {/* File attachments section */}
      {paste.files && paste.files.length > 0 && (
        <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-[#3c3836]">
            <h2 className="text-lg font-semibold">Attachments ({paste.files.length})</h2>
          </div>
          
          {downloadError && (
            <div className="p-3 bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400 text-sm">
              {downloadError}
            </div>
          )}
          
          <ul className="divide-y divide-gray-200 dark:divide-[#3c3836]">
            {paste.files.map(file => (
              <li key={file.id} className="p-4 hover:bg-gray-50 dark:hover:bg-[#3c3836] transition-colors">
                <button 
                  type="button"
                  onClick={(e) => handleFileDownload(file, e)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <div className="flex items-center">
                    <span className="text-2xl mr-3">{getFileIcon(file.filename)}</span>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-gray-100">{file.filename}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
                    </div>
                  </div>
                  <span className="ml-4 flex-shrink-0 px-3 py-1 text-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50">
                    Download
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      
      <div className="mt-6 text-center">
        <button 
          onClick={() => navigate('/')}
          className="px-4 py-2 bg-green-600 !bg-green-600 text-white hover:bg-green-700 rounded-md border-transparent dark:!bg-[#98971a] dark:!text-[#1d2021] dark:hover:!bg-[#79740e]"
        >
          Create New Paste
        </button>
      </div>
    </div>
  );
} 