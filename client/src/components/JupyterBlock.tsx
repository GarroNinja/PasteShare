import React, { useState, useEffect, useRef } from 'react';
import SyntaxHighlighter from 'react-syntax-highlighter';
import { gruvboxDark, gruvboxLight } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { useTheme } from '../hooks/useTheme';

interface JupyterBlockProps {
  content: string;
  language: string;
  order: number;
  isEditable: boolean;
  customTheme?: any;
  onContentChange?: (content: string) => void;
  onLanguageChange?: (language: string) => void;
  onDelete?: () => void;
  showLanguageSelector?: boolean;
}

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

export function JupyterBlock({
  content,
  language,
  order,
  isEditable,
  customTheme,
  onContentChange,
  onLanguageChange,
  onDelete,
  showLanguageSelector
}: JupyterBlockProps) {
  // Start in edit mode if the content is empty
  const [isEditing, setIsEditing] = useState(!content);
  const [localContent, setLocalContent] = useState(content || '');
  const [localLanguage, setLocalLanguage] = useState(language || 'text');
  const [copySuccess, setCopySuccess] = useState(false);
  const { isDarkMode } = useTheme();
  
  // Update local state when props change
  useEffect(() => {
    setLocalContent(content || '');
    setLocalLanguage(language || 'text');
  }, [content, language]);
  
  // Reset copy success message after 2 seconds
  useEffect(() => {
    if (copySuccess) {
      const timer = setTimeout(() => setCopySuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [copySuccess]);
  
  const handleEdit = () => {
    if (!isEditable) return;
    setIsEditing(true);
  };
  
  const handleSave = () => {
    if (onContentChange) onContentChange(localContent);
    if (onLanguageChange && localLanguage !== language) onLanguageChange(localLanguage);
    setIsEditing(false);
  };
  
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setLocalContent(newContent);
    // Optionally auto-save content changes
    if (onContentChange) {
      onContentChange(newContent);
    }
  };
  
  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLanguage = e.target.value;
    setLocalLanguage(newLanguage);
    if (onLanguageChange) {
      onLanguageChange(newLanguage);
    }
  };
  
  const handleDelete = () => {
    if (onDelete) onDelete();
  };
  
  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(localContent);
      setCopySuccess(true);
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };
  
  const getLanguageLabel = (value: string): string => {
    const option = LANGUAGE_OPTIONS.find(opt => opt.value === value);
    return option ? option.label : 'Plain Text';
  };
  
  // Determine if this block can be deleted (not the first block when in edit mode)
  const canDelete = isEditable && onDelete && order > 0;
  
  return (
    <div className="jupyter-block border dark:border-[#3c3836] rounded-lg overflow-hidden mb-6 shadow-sm hover:shadow-md transition-shadow duration-200">
      {/* Block header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-100 dark:bg-[#3c3836] border-b dark:border-[#504945]">
        <div className="flex items-center">
          <div className="flex items-center justify-center w-7 h-7 bg-gray-200 dark:bg-[#504945] rounded-full mr-3 text-sm font-medium text-gray-700 dark:text-gray-300">
            {order + 1}
          </div>
          
          {isEditing ? (
            <select
              value={localLanguage}
              onChange={handleLanguageChange}
              className="text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#504945] rounded px-2 py-1 focus:ring-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] focus:outline-none"
            >
              {LANGUAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : showLanguageSelector ? (
            <select
              value={localLanguage}
              onChange={handleLanguageChange}
              className="text-sm bg-white dark:bg-[#282828] border border-gray-300 dark:border-[#504945] rounded px-2 py-1 focus:ring-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] focus:outline-none"
              disabled={!onLanguageChange}
            >
              {LANGUAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {getLanguageLabel(localLanguage)}
            </span>
          )}
        </div>
        
        <div className="flex space-x-2">
          {!isEditable && (
            <button
              onClick={copyToClipboard}
              type="button"
              className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md ${
                copySuccess 
                  ? 'bg-green-600 text-white dark:bg-[#98971a] dark:text-[#fbf1c7]' 
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-[#504945] dark:text-gray-300 dark:hover:bg-[#665c54]'
              } transition-colors duration-200`}
              aria-label="Copy to clipboard"
            >
              {copySuccess ? (
                <>
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Copy
                </>
              )}
            </button>
          )}
          
          {isEditable && (
            <>
              {isEditing ? (
                <button
                  onClick={handleSave}
                  type="button"
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-green-600 text-white hover:bg-green-700 dark:bg-[#98971a] dark:text-[#1d2021] dark:hover:bg-[#79740e] transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Done
                </button>
              ) : (
                <button
                  onClick={handleEdit}
                  type="button"
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 dark:bg-[#458588] dark:text-[#ebdbb2] dark:hover:bg-[#076678] transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
              )}
              {canDelete && !isEditing && (
                <button
                  onClick={handleDelete}
                  type="button"
                  className="inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white hover:bg-red-700 dark:bg-[#cc241d] dark:text-[#ebdbb2] dark:hover:bg-[#9d0006] transition-colors duration-200"
                >
                  <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      {/* Block content */}
      <div className={`block-content ${isEditing ? 'p-0' : 'p-0'}`}>
        {isEditing ? (
          <textarea
            value={localContent}
            onChange={handleContentChange}
            className="w-full p-4 min-h-[120px] font-mono text-sm bg-white dark:bg-[#282828] text-gray-900 dark:text-[#ebdbb2] focus:outline-none border-0 focus:ring-0"
            placeholder="Enter code or text here..."
            autoFocus
          />
        ) : (
          <div 
            className="relative" 
            onClick={isEditable ? handleEdit : undefined}
          >
            {localContent ? (
              <SyntaxHighlighter 
                language={localLanguage} 
                style={customTheme || (isDarkMode ? gruvboxDark : gruvboxLight)}
                customStyle={{ 
                  margin: 0,
                  padding: '1.25rem',
                  backgroundColor: isDarkMode ? '#282828' : '#ffffff',
                  borderRadius: 0,
                  fontSize: '0.875rem',
                  lineHeight: '1.5',
                }}
                wrapLines={true}
                wrapLongLines={true}
                className={isEditable ? 'cursor-pointer' : ''}
              >
                {localContent}
              </SyntaxHighlighter>
            ) : (
              <div className="p-4 text-gray-400 dark:text-gray-500 italic">
                Empty block. {isEditable ? 'Click to edit.' : ''}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
} 