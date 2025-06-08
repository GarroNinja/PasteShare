import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/utils';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { 
  a11yDark, a11yLight, agate, anOldHope, androidstudio, 
  arduinoLight, atomOneDark, atomOneLight, 
  dracula, darcula, far, github, googlecode,
  gruvboxDark, gruvboxLight, hopscotch, hybrid, 
  monokai, monokaiSublime, nord, obsidian, 
  ocean, paraisoDark, railscasts, solarizedDark, solarizedLight,
  tomorrowNight, vs, vs2015, xcode, xt256, zenburn
} from 'react-syntax-highlighter/dist/esm/styles/hljs';
import CopyNotification from '../components/CopyNotification';
import { useTheme } from '../components/theme-provider';

import { JupyterBlock } from '../components/JupyterBlock';

interface File {
  id: string;
  filename: string;
  size: number;
  url: string;
  mimetype?: string;
}

interface PasteInfo {
  id: string;
  title: string;
  isPasswordProtected: boolean;
  customUrl?: string;
}

interface Block {
  id: string;
  content: string;
  language: string;
  order: number;
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
  isPasswordProtected?: boolean;
  isJupyterStyle?: boolean;
  blocks?: Block[];
}

// Define language options for the language selector
const LANGUAGE_OPTIONS = [
  { value: 'text', label: 'Plain Text' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'swift', label: 'Swift' },
  { value: 'scala', label: 'Scala' },
  { value: 'sql', label: 'SQL' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'json', label: 'JSON' },
  { value: 'xml', label: 'XML' },
  { value: 'yaml', label: 'YAML' },
  { value: 'bash', label: 'Bash' },
  { value: 'markdown', label: 'Markdown' }
];

export function PastePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [paste, setPaste] = useState<Paste | null>(null);
  const [pasteInfo, setPasteInfo] = useState<PasteInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const fetchedRef = useRef(false);
  
  // Edit mode state
  const [isEditMode, setIsEditMode] = useState(false);
  const [editableTitle, setEditableTitle] = useState('');
  const [editableContent, setEditableContent] = useState('');
  const [editableBlocks, setEditableBlocks] = useState<Block[]>([]);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [language, setLanguage] = useState<string>('plaintext');
  const { theme } = useTheme();
  const isDarkMode = theme === 'dark';
  
  const [selectedTheme, setSelectedTheme] = useState(() => {
    return isDarkMode ? gruvboxDark : gruvboxLight;
  });
  const [selectedThemeName, setSelectedThemeName] = useState(() => {
    return isDarkMode ? 'Gruvbox Dark' : 'Gruvbox Light';
  });
  
  // Update theme when dark mode changes
  useEffect(() => {
    setSelectedTheme(isDarkMode ? gruvboxDark : gruvboxLight);
    setSelectedThemeName(isDarkMode ? 'Gruvbox Dark' : 'Gruvbox Light');
  }, [isDarkMode]);
  
  // Notification state
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMessage, setNotificationMessage] = useState('');
  const [notificationButtonType, setNotificationButtonType] = useState<'success' | 'error'>('success');
  const [isPasswordPromptOpen, setIsPasswordPromptOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  
  const syntaxTheme = isDarkMode ? gruvboxDark : gruvboxLight;

  // Language state for individual blocks (keyed by block id)
  const [blockLanguages, setBlockLanguages] = useState<{[key: string]: string}>({});
  
  // Initialize block languages from paste data
  useEffect(() => {
    if (paste?.isJupyterStyle && paste.blocks && paste.blocks.length > 0) {
      const initialLanguages: {[key: string]: string} = {};
      paste.blocks.forEach(block => {
        initialLanguages[block.id] = block.language;
      });
      setBlockLanguages(initialLanguages);
    }
  }, [paste?.isJupyterStyle, paste?.blocks]);
  
  // Handle changing language for a specific block
  const handleBlockLanguageChange = (blockId: string, newLanguage: string) => {
    setBlockLanguages(prev => ({
      ...prev,
      [blockId]: newLanguage
    }));
  };

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
        // Use explicit GET method with no password initially
        const response = await fetch(`${getApiBaseUrl()}/pastes/${id}`, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });
        
        // Directly handle 403 for password protection
        if (response.status === 403) {
          const data = await response.json();
          
          if (data.pasteInfo) {
            setPasteInfo(data.pasteInfo);
            setIsPasswordPromptOpen(true);
            setLoading(false);
            return;
          }
        }
        
        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.paste) {
          // Full paste data
          setPaste(data.paste);
          setEditableTitle(data.paste.title || '');
          setEditableContent(data.paste.content || '');
          setLanguage(detectLanguage(data.paste.content));
        } else if (data.pasteInfo) {
          // Limited info for password protected paste
          setPasteInfo(data.pasteInfo);
          setIsPasswordPromptOpen(true);
        } else {
          setError("Invalid response format");
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

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!id || !password.trim()) return;
    
    setPasswordLoading(true);
    setPasswordError(null);
    
    try {
      // First verify the password
      const verifyResponse = await fetch(`${getApiBaseUrl()}/pastes/${id}/verify-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });
      
      if (!verifyResponse.ok) {
        const errorData = await verifyResponse.json();
        throw new Error(errorData.message || 'Invalid password');
      }
      
      const verifyResult = await verifyResponse.json();
      
      if (verifyResult.success) {
        // Now fetch the paste with the password
        const url = new URL(`${getApiBaseUrl()}/pastes/${id}`);
        url.searchParams.append('password', password);
        
        const pasteResponse = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include'
        });
        
        if (!pasteResponse.ok) {
          throw new Error(`Failed to fetch paste: ${pasteResponse.status}`);
        }
        
        const data = await pasteResponse.json();
        
        if (data.paste) {
          setPaste(data.paste);
          setEditableContent(data.paste.content);
          setEditableTitle(data.paste.title || '');
          setLanguage(detectLanguage(data.paste.content));
          setIsPasswordPromptOpen(false);
        } else {
          setPasswordError('Failed to load paste content');
        }
      } else {
        setPasswordError('Invalid password');
      }
    } catch (err) {
      console.error("Error verifying password:", err);
      setPasswordError(err instanceof Error ? err.message : 'Invalid password');
    } finally {
      setPasswordLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setNotificationButtonType('success');
      setNotificationMessage('Copied to clipboard!');
      setShowNotification(true);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };
  
  const copyLinkToClipboard = async () => {
    try {
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      setNotificationButtonType('success');
      setNotificationMessage('Link copied to clipboard!');
      setShowNotification(true);
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
      

      
      // Use fetch to get the file with proper credentials and mode
      const response = await fetch(fileUrl, {
        method: 'GET',
        credentials: 'include',
        mode: 'cors',
        headers: {
          'Accept': '*/*',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to download file: ${response.status}`);
      }
      
      // Get the blob from the response
      const blob = await response.blob();
      
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
    } catch (err) {
      console.error('File download error:', err);
      setDownloadError(`Failed to download file: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
  
  const handleEdit = () => {
    if (!paste) return;
    
    if (paste.isJupyterStyle && paste.blocks) {
      // Deep clone blocks for editing to avoid reference issues
      const blocks = paste.blocks.map(block => ({
        ...block,
        id: block.id, // Explicitly preserve block ID for proper updating
        content: block.content || '',
        language: block.language || 'text',
        order: block.order
      }));
      
      setEditableBlocks(blocks);
      
      // Also initialize the block languages state
      const initialLanguages: {[key: string]: string} = {};
      blocks.forEach(block => {
        initialLanguages[block.id] = block.language;
      });
      setBlockLanguages(initialLanguages);
    } else {
      setEditableContent(paste.content || '');
    }
    
    setEditableTitle(paste.title || '');
    setIsEditMode(true);
  };
  
  const handleCancelEdit = () => {
    setEditableTitle('');
    setEditableContent('');
    setEditableBlocks([]);
    setIsEditMode(false);
  };
  
  const handleSaveEdit = async () => {
    if (!paste) return;
    setEditLoading(true);
    setEditError(null);
    try {
      const updatedData: any = { title: editableTitle };
      if (paste.isJupyterStyle) {
        if (!editableBlocks || editableBlocks.length === 0) {
          throw new Error("No blocks found. Jupyter notebook requires at least one block.");
        }
        
        // Filter out completely empty blocks
        const nonEmptyBlocks = editableBlocks.filter(block => block.content.trim() !== '');
        
        if (nonEmptyBlocks.length === 0) {
          throw new Error("All blocks are empty. Jupyter notebook requires at least one non-empty block.");
        }
        
        const formattedBlocks = nonEmptyBlocks.map((block, index) => {
          const blockId = (block.id && typeof block.id === 'string' && 
                     /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(block.id))
            ? block.id
            : crypto.randomUUID();
          return {
            id: blockId,
            content: block.content || '',
            language: block.language || 'text',
            order: index
          };
        });
        updatedData.blocks = formattedBlocks;
      } else {
        if (!editableContent || editableContent.trim() === '') {
          throw new Error("Content cannot be empty");
        }
        updatedData.content = editableContent;
      }
      const requestOptions = {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedData),
        credentials: 'include' as RequestCredentials
      };
      try {
        const response = await fetch(`${getApiBaseUrl()}/pastes/${id}`, requestOptions);
        if (!response.ok) {
          let errorMsg = `Failed to update paste: ${response.status}`;
          try {
            const errorData = await response.json();
            errorMsg = errorData.message || errorMsg;
          } catch {}
          setEditError(errorMsg);
          setEditLoading(false);
          return;
        }
        const data = await response.json();
        if (data.paste) {
          setPaste(data.paste);
          setEditableBlocks([]);
          setEditableContent('');
          setIsEditMode(false);
          setNotificationButtonType('success');
          setNotificationMessage('Paste updated successfully');
          setShowNotification(true);
        }
      } catch (fetchError) {
        console.error('Fetch error:', fetchError);
        setEditError(fetchError instanceof Error ? fetchError.message : String(fetchError));
      }
    } catch (err) {
      console.error('Edit error:', err);
      setEditError(err instanceof Error ? err.message : 'Failed to update paste. Please try again.');
    } finally {
      setEditLoading(false);
    }
  };

  const addBlock = () => {
    // Create new block
    const newBlock = {
      id: crypto.randomUUID(), // Generate a temporary ID
      content: '',
      language: 'text',
      order: editableBlocks.length
    };
    
    // Add to local state
    setEditableBlocks(prev => [...prev, newBlock]);
  };
  
  const removeBlock = (id: string) => {
    // Don't allow removing the last block
    if (editableBlocks.length <= 1) {
      return;
    }
    
    // Remove from local state
    setEditableBlocks(prev => {
      const filtered = prev.filter(block => block.id !== id);
      return filtered.map((block, index) => ({
        ...block,
        order: index
      }));
    });
  };
  
  const updateBlockContent = (id: string, newContent: string) => {
    setEditableBlocks(prev => 
      prev.map(block => 
        block.id === id ? { ...block, content: newContent } : block
      )
    );
  };
  
  const updateBlockLanguage = (id: string, newLanguage: string) => {
    // Update the language in editableBlocks
    setEditableBlocks(prev => 
      prev.map(block => 
        block.id === id ? { ...block, language: newLanguage } : block
      )
    );
    
    // Also update in blockLanguages for consistent state
    setBlockLanguages(prev => ({
      ...prev,
      [id]: newLanguage
    }));
    

  };

  // Structure the paste content display based on paste type
  const renderPasteContent = () => {
    if (loading) {
      return (
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3 mb-4"></div>
        </div>
      );
    }

    if (error) {
      return <div className="text-red-500 dark:text-red-400">{error}</div>;
    }

    if (!paste) {
      return <div className="text-gray-500 dark:text-gray-400">Paste not found</div>;
    }

    if (isEditMode) {
      return (
        <div className="edit-container">
          {/* Title is displayed but not editable */}
          <h2 className="text-xl font-semibold mb-4">{paste.title || 'Untitled Paste'}</h2>
          
          {paste.isJupyterStyle && editableBlocks.length > 0 ? (
            <div>
              <div className="mb-6">
                {editableBlocks.map((block, index) => (
                  <JupyterBlock
                    key={block.id}
                    content={block.content}
                    language={block.language}
                    order={index}
                    isEditable={true}
                    onContentChange={(content) => updateBlockContent(block.id, content)}
                    onLanguageChange={(language) => updateBlockLanguage(block.id, language)}
                    onDelete={() => removeBlock(block.id)}
                  />
                ))}
              </div>
              <button
                onClick={addBlock}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 dark:bg-[#98971a] dark:text-[#1d2021] dark:hover:bg-[#79740e] transition-colors duration-200"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Add Block
              </button>
            </div>
          ) : (
            <textarea
              value={editableContent}
              onChange={(e) => setEditableContent(e.target.value)}
              className="w-full p-4 min-h-[300px] border border-gray-300 dark:border-[#504945] rounded-md bg-white dark:bg-[#282828] text-gray-900 dark:text-[#ebdbb2]"
            />
          )}
          
          <div className="mt-6 flex space-x-3 justify-end">
            <button
              onClick={handleCancelEdit}
              className="px-4 py-2 rounded-md text-gray-700 dark:text-gray-300 bg-gray-200 hover:bg-gray-300 dark:bg-[#504945] dark:hover:bg-[#665c54] transition-colors duration-200"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveEdit}
              disabled={editLoading}
              className={`px-4 py-2 rounded-md text-white bg-green-600 hover:bg-green-700 dark:bg-[#98971a] dark:text-[#1d2021] dark:hover:bg-[#79740e] transition-colors duration-200 ${
                editLoading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {editLoading ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
          
          {editError && (
            <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded">
              {editError}
            </div>
          )}
        </div>
      );
    }

    // Viewing mode
    if (paste.isJupyterStyle && paste.blocks && paste.blocks.length > 0) {
      return (
        <div className="jupyter-notebook-container">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-[#3c3836] rounded-md">
            {/* Theme selector */}
            <div className="flex items-center">
              <label htmlFor="theme-selector" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
                Theme:
              </label>
              <select
                id="theme-selector"
                value={selectedThemeName}
                onChange={(e) => {
                  const selectedThemeObj = availableThemes.find(t => t.name === e.target.value);
                  if (selectedThemeObj) {
                    setSelectedTheme(selectedThemeObj.value);
                    setSelectedThemeName(selectedThemeObj.name);
                  }
                }}
                className="text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#504945] rounded px-2 py-1 focus:ring-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] focus:outline-none"
              >
                {availableThemes.map(theme => (
                  <option key={theme.name} value={theme.name}>
                    {theme.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          
          <div className="jupyter-blocks">
            {paste.blocks.map((block, index) => (
              <JupyterBlock
                key={block.id}
                content={block.content}
                language={blockLanguages[block.id] || block.language}
                order={index}
                isEditable={isEditMode}
                customTheme={selectedTheme}
                onLanguageChange={(language) => handleBlockLanguageChange(block.id, language)}
                showLanguageSelector={true}
              />
            ))}
          </div>
        </div>
      );
    }

    return (
      <div className="relative group">
        {/* Theme and language selectors for standard pastes */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 p-2 bg-gray-50 dark:bg-[#3c3836] rounded-md">
          <div className="flex items-center">
            <label htmlFor="language-selector" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
              Language:
            </label>
            <select
              id="language-selector"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#504945] rounded px-2 py-1 focus:ring-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] focus:outline-none"
            >
              {LANGUAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          
          <div className="flex items-center">
            <label htmlFor="theme-selector-standard" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
              Theme:
            </label>
            <select
              id="theme-selector-standard"
              value={selectedThemeName}
              onChange={(e) => {
                const selectedThemeObj = availableThemes.find(t => t.name === e.target.value);
                if (selectedThemeObj) {
                  setSelectedTheme(selectedThemeObj.value);
                  setSelectedThemeName(selectedThemeObj.name);
                }
              }}
              className="text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#504945] rounded px-2 py-1 focus:ring-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] focus:outline-none"
            >
              {availableThemes.map(theme => (
                <option key={theme.name} value={theme.name}>
                  {theme.name}
                </option>
              ))}
            </select>
            
            <button
              onClick={() => copyToClipboard(paste.content)}
              className="ml-3 p-2 bg-white dark:bg-[#3c3836] border border-gray-300 dark:border-[#504945] rounded-md text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-opacity"
              aria-label="Copy to clipboard"
              title="Copy to clipboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
        </div>
        
        <div className="relative">
          <SyntaxHighlighter
            language={language}
            style={selectedTheme || (isDarkMode ? gruvboxDark : gruvboxLight)}
            customStyle={{
              borderRadius: '0.375rem',
              padding: '1.25rem',
              fontSize: '0.875rem',
              lineHeight: '1.5',
            }}
            wrapLines={true}
            wrapLongLines={true}
          >
            {paste.content}
          </SyntaxHighlighter>
        </div>
      </div>
    );
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

  if (isPasswordPromptOpen && pasteInfo) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] overflow-hidden">
          <div className="p-4 border-b border-gray-200 dark:border-[#3c3836]">
            <h1 className="text-xl font-semibold">Password Protected Paste</h1>
          </div>
          
          <div className="p-4">
            <p className="mb-4 text-gray-700 dark:text-gray-300">
              This paste is password protected. Please enter the password to view it.
            </p>
            
            <form onSubmit={handleSubmitPassword} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Password
                </label>
                <input
                  type="password"
                  id="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
                />
              </div>
              
              {passwordError && (
                <div className="p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded">
                  {passwordError}
                </div>
              )}
              
              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => navigate('/')}
                  className="px-4 py-2 border border-gray-300 dark:border-[#504945] text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-[#3c3836]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={passwordLoading || !password.trim()}
                  className={`px-4 py-2 rounded ${
                    passwordLoading || !password.trim()
                      ? 'bg-gray-300 text-gray-500 dark:bg-[#504945] dark:text-gray-400 cursor-not-allowed'
                      : 'bg-green-600 text-white dark:bg-[#98971a] dark:text-[#1d2021] hover:bg-green-700 dark:hover:bg-[#79740e]'
                  }`}
                >
                  {passwordLoading ? 'Verifying...' : 'Submit'}
                </button>
              </div>
            </form>
          </div>
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
      {showNotification && (
        <CopyNotification 
          message={notificationMessage}
          isVisible={showNotification}
          onClose={() => setShowNotification(false)}
          buttonType={notificationButtonType}
        />
      )}
      
      {paste && (
      <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] overflow-hidden mb-4">
        <div className="p-4 border-b border-gray-200 dark:border-[#3c3836] flex flex-col sm:flex-row sm:justify-between sm:items-center">
            {!isEditMode && (
            <h1 className="text-xl font-semibold mb-3 sm:mb-0 truncate max-w-full">{paste.title || 'Untitled Paste'}</h1>
          )}
          
          <div className="flex flex-wrap gap-2 mt-2 sm:mt-0 sm:flex-shrink-0">
              {!isEditMode && (
              <>
                <button 
                    onClick={() => copyToClipboard(paste.isJupyterStyle && paste.blocks ? 
                      paste.blocks.map(b => b.content).join('\n\n') : 
                      paste.content
                    )}
                  className="px-3 py-1 text-sm bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded hover:bg-green-200 dark:hover:bg-green-900/50"
                >
                  Copy
                </button>
                <button 
                  onClick={copyLinkToClipboard}
                  className="px-3 py-1 text-sm bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 rounded hover:bg-blue-200 dark:hover:bg-blue-900/50"
                >
                  Copy Link
                </button>
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
          </div>
        </div>
        
          {/* Paste content */}
          <div className="mb-4 relative p-4">
            {renderPasteContent()}
          </div>
        
        <div className="p-3 bg-gray-50 dark:bg-[#1d2021] text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-[#3c3836]">
          <p>Created: {new Date(paste.createdAt).toLocaleString()}</p>
          {paste.expiresAt && (
            <p>Expires: {new Date(paste.expiresAt).toLocaleString()}</p>
          )}
          
          <div className="flex flex-wrap gap-2 mt-1">
            {paste.isPrivate && (
              <span className="inline-flex items-center px-2 py-1 bg-amber-100 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-full text-xs">
                  Unlisted
              </span>
            )}
            
            {paste.isEditable && (
              <span className="inline-flex items-center px-2 py-1 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-full text-xs">
                Editable
              </span>
            )}
              
              {paste.isPasswordProtected && (
                <span className="inline-flex items-center px-2 py-1 bg-blue-100 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 rounded-full text-xs">
                  Password Protected
                </span>
              )}
              
              {paste.isJupyterStyle && (
                <span className="inline-flex items-center px-2 py-1 bg-indigo-100 dark:bg-indigo-900/20 text-indigo-800 dark:text-indigo-300 rounded-full text-xs">
                  Jupyter Notebook
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
      )}
      
      {/* File attachments section */}
      {paste && paste.files && paste.files.length > 0 && (
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