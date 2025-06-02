import React, { useState, useRef, useEffect } from 'react';
import { EXPIRY_OPTIONS } from '../lib/utils';

interface CreatePasteFormProps {
  onSubmit: (data: {
    content: string;
    expiresIn: number;
    title: string;
    isPrivate: boolean;
    customUrl?: string;
    isEditable: boolean;
    password?: string;
    files?: File[];
  }) => void;
  isLoading: boolean;
}

export function CreatePasteForm({ onSubmit, isLoading }: CreatePasteFormProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [expiresIn, setExpiresIn] = useState(86400); // Default to 1 day
  const [isPrivate, setIsPrivate] = useState(false);
  const [customUrl, setCustomUrl] = useState('');
  const [isEditable, setIsEditable] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  
  // Dropdown state
  const [isExpiryOpen, setIsExpiryOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsExpiryOpen(false);
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Get the label for the currently selected expiry option
  const selectedExpiryLabel = EXPIRY_OPTIONS.find(option => 
    Number(option.value) === expiresIn)?.label || 'Select expiry';

  const validateCustomUrl = (url: string) => {
    if (!url) {
      setCustomUrlError(null);
      return true;
    }
    
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    if (!validPattern.test(url)) {
      setCustomUrlError('Custom URL can only contain letters, numbers, underscores and hyphens');
      return false;
    }
    
    if (url.length < 3 || url.length > 50) {
      setCustomUrlError('Custom URL must be between 3 and 50 characters');
      return false;
    }
    
    // Check for reserved routes
    const reservedRoutes = ['recent', 'api', 'health'];
    if (reservedRoutes.includes(url.toLowerCase())) {
      setCustomUrlError(`"${url}" is a reserved route and cannot be used as a custom URL`);
      return false;
    }
    
    setCustomUrlError(null);
    return true;
  };

  const validatePassword = (pass: string) => {
    if (!isPasswordProtected) {
      setPasswordError(null);
      return true;
    }
    
    if (!pass) {
      setPasswordError('Password is required when password protection is enabled');
      return false;
    }
    
    if (pass.length < 4) {
      setPasswordError('Password must be at least 4 characters long');
      return false;
    }
    
    setPasswordError(null);
    return true;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (customUrl && !validateCustomUrl(customUrl)) {
      return;
    }
    
    if (!validatePassword(password)) {
      return;
    }
    
    onSubmit({
      title,
      content,
      expiresIn,
      isPrivate,
      customUrl: customUrl || undefined,
      isEditable,
      password: isPasswordProtected ? password : undefined,
      files: files.length > 0 ? files : undefined,
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files);
      
      // Check file size limit (10MB per file)
      const maxSize = 10 * 1024 * 1024; // 10MB
      const oversizedFiles = selectedFiles.filter(file => file.size > maxSize);
      
      if (oversizedFiles.length > 0) {
        setFileError(`Some files exceed the 10MB limit: ${oversizedFiles.map(f => f.name).join(', ')}`);
        return;
      }
      
      // Check total number of files (max 3)
      if (files.length + selectedFiles.length > 3) {
        setFileError('You can upload a maximum of 3 files');
        return;
      }
      
      setFileError(null);
      setFiles(prev => [...prev, ...selectedFiles]);
      
      // Reset the input to allow selecting the same file again
      e.target.value = '';
    }
  };
  
  const removeFile = (index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
    setFileError(null);
  };
  
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };
  
  const getFileIcon = (filename: string) => {
    const extension = filename.split('.').pop()?.toLowerCase() || '';
    
    switch (extension) {
      case 'pdf':
        return '📄';
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'svg':
        return '🖼️';
      case 'mp3':
      case 'wav':
      case 'ogg':
        return '🎵';
      case 'mp4':
      case 'webm':
      case 'mov':
        return '🎬';
      case 'doc':
      case 'docx':
        return '📝';
      case 'xls':
      case 'xlsx':
        return '📊';
      case 'ppt':
      case 'pptx':
        return '📊';
      case 'zip':
      case 'rar':
      case '7z':
        return '📦';
      default:
        return '📄';
    }
  };
  
  const handleExpirySelect = (value: string) => {
    setExpiresIn(Number(value));
    setIsExpiryOpen(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
      <div>
        <label htmlFor="title" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Title (optional)
        </label>
        <input
          type="text"
          id="title"
          placeholder="Untitled Paste"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
        />
      </div>
      
      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Paste Content
        </label>
        <textarea
          id="content"
          placeholder="Enter your code or text here..."
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={10}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
        ></textarea>
      </div>
      
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        <div className="w-full">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Expires In
          </label>
          <div className="relative mt-1" ref={dropdownRef}>
            <button
              type="button"
              onClick={() => setIsExpiryOpen(!isExpiryOpen)}
              className="w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-left text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
            >
              {selectedExpiryLabel}
              <span className="absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="none" stroke="currentColor">
                  <path d="M7 7l3-3 3 3m0 6l-3 3-3-3" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
            
            {/* Hidden input to maintain form compatibility */}
            <input 
              type="hidden" 
              name="expiresIn" 
              value={expiresIn.toString()} 
            />
            
            {isExpiryOpen && (
              <div className="absolute z-10 mt-1 w-full rounded-md bg-white dark:bg-[#282828] shadow-lg border border-gray-300 dark:border-[#504945]">
                <ul className="max-h-60 rounded-md py-1 text-base overflow-auto focus:outline-none">
                  {EXPIRY_OPTIONS.map((option) => (
                    <li
                      key={option.value}
                      onClick={() => handleExpirySelect(option.value)}
                      className={`cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 dark:hover:bg-[#3c3836] ${
                        Number(option.value) === expiresIn ? 'bg-gray-100 dark:bg-[#3c3836] font-medium' : ''
                      } text-gray-900 dark:text-[#ebdbb2]`}
                    >
                      {option.label}
                      {Number(option.value) === expiresIn && (
                        <span className="absolute inset-y-0 right-0 flex items-center pr-4 text-green-600 dark:text-green-500">
                          <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
        
        <div className="w-full">
          <label htmlFor="customUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Custom URL (optional)
          </label>
          <div className="mt-1 flex rounded-md shadow-sm">
            <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-gray-300 dark:border-[#504945] bg-gray-50 dark:bg-[#3c3836] text-gray-500 dark:text-gray-400 text-sm">
              /
            </span>
            <input
              type="text"
              id="customUrl"
              placeholder="my-custom-url"
              value={customUrl}
              onChange={(e) => {
                setCustomUrl(e.target.value);
                validateCustomUrl(e.target.value);
              }}
              className="flex-1 min-w-0 block w-full px-3 py-2 rounded-none rounded-r-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
            />
          </div>
          {customUrlError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{customUrlError}</p>
          )}
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Create a memorable URL for easy sharing
          </p>
        </div>
      </div>
      
      <div className="w-full">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Attach Files (optional, max 3)
        </label>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <label 
            htmlFor="files" 
            className="cursor-pointer px-4 py-2 text-sm font-medium rounded-md bg-[#f2e5bc] text-[#79740e] dark:bg-[#282828] dark:text-[#98971a] hover:bg-[#fbf1c7] dark:hover:bg-[#504945] border border-[#d5c4a1] dark:border-[#504945]"
          >
            Choose Files
          </label>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {files.length > 0 ? `${files.length} file${files.length !== 1 ? 's' : ''} selected` : 'No file chosen'}
          </span>
          <input
            type="file"
            id="files"
            multiple
            onChange={handleFileChange}
            className="hidden"
          />
        </div>
        {fileError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fileError}</p>
        )}
      </div>
      
      {/* File preview */}
      {files.length > 0 && (
        <div className="mt-2">
          <ul className="divide-y divide-gray-200 dark:divide-[#3c3836] border border-gray-200 dark:border-[#3c3836] rounded-md overflow-hidden">
            {files.map((file, index) => (
              <li key={index} className="flex items-center justify-between p-3 bg-white dark:bg-[#282828]">
                <div className="flex items-center">
                  <span className="text-xl mr-3">{getFileIcon(file.name)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                  className="ml-2 text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Files will be available for download from the paste page.
          </p>
        </div>
      )}
      
      <div className="flex flex-col gap-3">
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isPrivate"
            checked={isPrivate}
            onChange={(e) => setIsPrivate(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#98971a] dark:text-[#b8bb26] focus:ring-[#79740e] dark:focus:ring-[#98971a]"
          />
          <label htmlFor="isPrivate" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Unlisted Paste (only accessible with the link)
          </label>
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isEditable"
            checked={isEditable}
            onChange={(e) => setIsEditable(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-[#98971a] dark:text-[#b8bb26] focus:ring-[#79740e] dark:focus:ring-[#98971a]"
          />
          <label htmlFor="isEditable" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Allow Editing {isPrivate ? '(anyone with url can edit)' : '(anyone can edit)'}
          </label>
        </div>
        
        <div className="flex items-center">
          <input
            type="checkbox"
            id="isPasswordProtected"
            checked={isPasswordProtected}
            onChange={(e) => {
              setIsPasswordProtected(e.target.checked);
              if (!e.target.checked) {
                setPassword('');
                setPasswordError(null);
              }
            }}
            className="h-4 w-4 rounded border-gray-300 text-[#98971a] dark:text-[#b8bb26] focus:ring-[#79740e] dark:focus:ring-[#98971a]"
          />
          <label htmlFor="isPasswordProtected" className="ml-2 block text-sm text-gray-700 dark:text-gray-300">
            Password Protection
          </label>
        </div>
        
        {isPasswordProtected && (
          <div className="ml-6 mt-2">
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                validatePassword(e.target.value);
              }}
              placeholder="Enter password"
              className="mt-1 block w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
            />
            {passwordError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">{passwordError}</p>
            )}
          </div>
        )}
      </div>
      
      <div>
        <button
          type="submit"
          disabled={isLoading || !content.trim() || fileError !== null || customUrlError !== null || passwordError !== null}
          className={`w-full rounded-md px-4 py-3 text-sm font-medium shadow-sm border 
                    ${isLoading || !content.trim() || fileError !== null || customUrlError !== null || passwordError !== null
                      ? 'bg-gray-300 text-gray-500 dark:bg-[#504945] dark:text-gray-300 cursor-not-allowed border-transparent dark:border-[#3c3836]' 
                      : 'bg-green-600 !bg-green-600 text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 border-transparent dark:!bg-[#98971a] dark:!text-[#1d2021] dark:hover:!bg-[#79740e] dark:focus:ring-[#b8bb26]'}`}
        >
          {isLoading ? 'Creating...' : 'Create Paste'}
        </button>
      </div>
    </form>
  );
} 