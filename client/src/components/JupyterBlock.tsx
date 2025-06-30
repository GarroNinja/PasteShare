import React, { useState, useEffect } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useTheme } from './ThemeProvider';

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

interface JupyterBlockProps {
  content: string;
  language: string;
  order: number;
  isEditable?: boolean;
  customTheme?: any;
  onContentChange?: (content: string) => void;
  onLanguageChange?: (language: string) => void;
  onDelete?: () => void;
  showLanguageSelector?: boolean;
}

export function JupyterBlock({
  content,
  language,
  order,
  isEditable = false,
  customTheme,
  onContentChange,
  onLanguageChange,
  onDelete,
  showLanguageSelector = false
}: JupyterBlockProps) {
  const [editableContent, setEditableContent] = useState(content);
  const { theme: currentTheme } = useTheme();
  const isDarkMode = currentTheme === 'dark';
  const [internalLanguage, setInternalLanguage] = useState(language || 'text');
  
  // Update internal state when props change
  useEffect(() => {
    setEditableContent(content);
  }, [content]);
  
  useEffect(() => {
    setInternalLanguage(language || 'text');
  }, [language]);
  
  // Handle content changes
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setEditableContent(newContent);
    if (onContentChange) onContentChange(newContent);
  };
  
  // Handle language changes
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    setInternalLanguage(newLanguage);
    if (onLanguageChange) onLanguageChange(newLanguage);
  };
  
  // Copy block content to clipboard
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(content);
      // You could add a notification here
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };
  
  // Use either the custom theme or the default theme based on dark mode
  const syntaxTheme = customTheme || (isDarkMode ? gruvboxDark : gruvboxLight);
  
  return (
    <div className="mb-6 rounded-md overflow-hidden border border-gray-200 dark:border-[#3c3836]">
      <div className="flex items-center justify-between p-2 bg-gray-100 dark:bg-[#3c3836]">
        <div className="flex items-center">
          <div className="flex items-center mr-3">
            <div className="w-6 h-6 bg-[#98971a] text-[#282828] rounded-full flex items-center justify-center text-xs font-bold">
              {order + 1}
            </div>
          </div>
          
          {(showLanguageSelector || isEditable) && (
            <select
              value={internalLanguage}
              onChange={handleLanguageChange}
              disabled={!isEditable}
              className="text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#504945] rounded px-2 py-1 focus:ring-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] focus:outline-none"
            >
              {LANGUAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          {!isEditable && (
            <button
              onClick={copyToClipboard}
              className="p-1 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              title="Copy to clipboard"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          )}
          
          {isEditable && onDelete && (
            <button
              onClick={onDelete}
              className="p-1 text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              title="Delete block"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
        </div>
      </div>
      
      <div className="block-content">
        {isEditable ? (
          <textarea
            value={editableContent}
            onChange={handleContentChange}
            className="w-full p-4 min-h-[150px] border-0 focus:ring-0 bg-white dark:bg-[#282828] text-gray-900 dark:text-[#ebdbb2] font-mono"
            placeholder="Enter code or text..."
          />
        ) : (
          <SyntaxHighlighter
            language={internalLanguage}
            style={syntaxTheme}
            customStyle={{
              margin: 0,
              padding: '1rem',
              borderRadius: 0,
              fontSize: '0.875rem',
              lineHeight: '1.5',
            }}
            wrapLines={true}
            wrapLongLines={true}
          >
            {content}
          </SyntaxHighlighter>
        )}
      </div>
    </div>
  );
} 