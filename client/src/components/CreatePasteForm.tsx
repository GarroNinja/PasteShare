import React, { useState, useRef, useEffect } from 'react';
import { EXPIRY_OPTIONS } from '../lib/utils';
import { JupyterBlock } from './JupyterBlock';

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
    isJupyterStyle?: boolean;
    blocks?: Array<{content: string, language: string, order: number}>;
  }) => void;
  isLoading: boolean;
}

interface Block {
  id: string;
  content: string;
  language: string;
  order: number;
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
  const [pasteSuccess, setPasteSuccess] = useState<string | null>(null);
  const [isPasting, setIsPasting] = useState(false);
  const [customUrlError, setCustomUrlError] = useState<string | null>(null);
  const [isPasswordProtected, setIsPasswordProtected] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [urlCheckTimeout, setUrlCheckTimeout] = useState<NodeJS.Timeout | null>(null);
  
  // Jupyter-style notebook state
  const [isJupyterStyle, setIsJupyterStyle] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([
    { id: crypto.randomUUID(), content: '', language: 'text', order: 0 }
  ]);
  
  // Dropdown state
  const [isExpiryOpen, setIsExpiryOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const [jupyterError, setJupyterError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  // Utility function for formatting file sizes
  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    else if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    else if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    else return (bytes / (1024 * 1024 * 1024)).toFixed(1) + ' GB';
  };

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

  // Handle clipboard paste events for images
  useEffect(() => {
    const handlePaste = async (event: ClipboardEvent) => {
      // Only handle paste events when the form is focused or when pasting in content areas
      const target = event.target as HTMLElement;
      const isInForm = target.closest('form') !== null;
      const isTextInput = target.tagName === 'TEXTAREA' || target.tagName === 'INPUT';
      
      if (!isInForm && !isTextInput) {
        return;
      }

      const clipboardData = event.clipboardData;
      if (!clipboardData) return;

      // Check if clipboard contains image data
      const items = Array.from(clipboardData.items);
      const imageItems = items.filter(item => item.type.startsWith('image/'));

      if (imageItems.length === 0) {
        return; // No images in clipboard, let default paste behavior continue
      }

      // Prevent default paste behavior for images
      event.preventDefault();
      
      // Show pasting indicator
      setIsPasting(true);

      for (const item of imageItems) {
        try {
          const file = item.getAsFile();
          if (!file) continue;

          // Generate a filename with timestamp and proper extension
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').split('.')[0];
          const extension = file.type.split('/')[1] || 'png';
          const filename = `pasted-image-${timestamp}.${extension}`;

          // Create a new File object with a proper name
          const namedFile = new File([file], filename, {
            type: file.type,
            lastModified: Date.now()
          });

          // Check file size limit (10MB)
          const maxSize = 10 * 1024 * 1024;
          if (namedFile.size > maxSize) {
            setFileError(`Pasted image is too large (${formatFileSize(namedFile.size)}). Maximum size is 10MB.`);
            continue;
          }

          // Check total number of files (max 3)
          if (files.length >= 3) {
            setFileError('You can upload a maximum of 3 files. Remove some files before pasting images.');
            continue;
          }

          // Add the file to the files array
          setFiles(prev => [...prev, namedFile]);
          setFileError(null);

          // Show a success message
          setPasteSuccess(`Image pasted: ${filename}`);
          
          // Clear success message after 3 seconds
          setTimeout(() => {
            setPasteSuccess(null);
          }, 3000);

  
          
        } catch (error) {
          console.error('Error processing pasted image:', error);
          setFileError('Failed to process pasted image. Please try again.');
        }
      }
      
      // Hide pasting indicator
      setIsPasting(false);
    };

    // Add event listener to document
    document.addEventListener('paste', handlePaste);

    return () => {
      document.removeEventListener('paste', handlePaste);
    };
  }, [files]); // Re-run when files array changes

  // Get the label for the currently selected expiry option
  const selectedExpiryLabel = EXPIRY_OPTIONS.find(option => 
    Number(option.value) === expiresIn)?.label || 'Select expiry';

  const validateCustomUrl = async (url: string) => {
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
    const reservedRoutes = ['recent', 'api', 'health', 'raw'];
    if (reservedRoutes.includes(url.toLowerCase())) {
      setCustomUrlError(`"${url}" is a reserved route and cannot be used as a custom URL`);
      return false;
    }
    
    // Check if URL is already taken
    setIsCheckingUrl(true);
    try {
      const { getApiBaseUrl } = await import('../lib/utils');
      const response = await fetch(`${getApiBaseUrl()}/pastes/check-url/${encodeURIComponent(url)}`);
      const data = await response.json();
      
      if (!data.available) {
        setCustomUrlError(`"${url}" is already taken. Please choose a different URL.`);
        setIsCheckingUrl(false);
        return false;
      }
    } catch (error) {
      console.error('Error checking URL availability:', error);
      // Don't block submission if check fails, just warn
      setCustomUrlError('Unable to verify URL availability. The URL might already be taken.');
    }
    setIsCheckingUrl(false);
    
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

  // Local validation without relying on DOM manipulation
  const validateForm = (): boolean => {
    // Reset all error states
    setCustomUrlError(null);
    setPasswordError(null);
    setFileError(null);
    setJupyterError(null);
    setFormError(null);
    
    let isValid = true;
    
    // Validate custom URL if provided
    if (customUrl && customUrlError) {
      isValid = false;
    }
    
    // Validate password if password protection is enabled
    if (!validatePassword(password)) {
      isValid = false;
    }
    
    // Validate content based on paste type
    if (isJupyterStyle) {
      // Check if there are any blocks with content
      const hasContent = blocks.some(block => block.content.trim());
      if (!hasContent) {
        setJupyterError("At least one block must have content");
        isValid = false;
      }
    } else {
      // Standard paste content validation
      if (!content.trim()) {
        setFormError("Content is required for standard pastes");
        isValid = false;
      }
    }
    
    return isValid;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prevent double submission
    if (isLoading) {
      return;
    }
    
    // Validate form and return early if invalid
    if (!validateForm()) {
      return;
    }
    

    
    if (isJupyterStyle) {
      // Filter out empty blocks to avoid server errors
      const nonEmptyBlocks = blocks.filter(block => block.content.trim());
      
      if (nonEmptyBlocks.length === 0) {
        setJupyterError("Please add content to at least one block");
        return;
      }
      
      
      
      // Reorder blocks to ensure proper sequence
      const reorderedBlocks = nonEmptyBlocks.map((block, index) => ({
        ...block,
        order: index
      }));
      
      onSubmit({
        title,
        content: "dummy-content-for-jupyter",  // Set a dummy content value to pass validation
        expiresIn,
        isPrivate,
        customUrl: customUrl || undefined,
        isEditable,
        password: isPasswordProtected ? password : undefined,
        files: files.length > 0 ? files : undefined,
        isJupyterStyle: true,
        blocks: reorderedBlocks
      });
    } else {
      // Standard paste submission
      
    
    onSubmit({
      title,
      content,
      expiresIn,
      isPrivate,
      customUrl: customUrl || undefined,
      isEditable,
        password: isPasswordProtected ? password : undefined,
      files: files.length > 0 ? files : undefined,
        isJupyterStyle: false
    });
    }
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
  
  // Jupyter block functions
  const addBlock = () => {
    // Create a new empty block
    const newBlock = {
      id: crypto.randomUUID(),
      content: '',
      language: 'text',
      order: blocks.length
    };
    
    // Add the new block to the list
    setBlocks(prevBlocks => [...prevBlocks, newBlock]);
  };
  
  const removeBlock = (id: string) => {
    // Don't allow removing the last block
    if (blocks.length <= 1) {
      return;
    }
    
    // Simple filtering approach to avoid React DOM errors
    setBlocks(prevBlocks => {
      const filtered = prevBlocks.filter(block => block.id !== id);
      
      // Update the order of blocks
      return filtered.map((block, index) => ({
        ...block,
        order: index
      }));
    });
  };
  
  const updateBlockContent = (id: string, newContent: string) => {
    // Direct update to prevent race conditions
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === id ? { ...block, content: newContent } : block
      )
    );
  };
  
  const updateBlockLanguage = (id: string, newLanguage: string) => {
    // Direct update to prevent race conditions
    setBlocks(prevBlocks => 
      prevBlocks.map(block => 
        block.id === id ? { ...block, language: newLanguage } : block
      )
    );
  };
  
  const togglePasteStyle = () => {
    setIsJupyterStyle(!isJupyterStyle);
    setJupyterError(null);
    
    // If switching to Jupyter style
    if (!isJupyterStyle) {
      // If there's content, convert it to a block
      if (content.trim()) {
        setBlocks([{ 
          id: crypto.randomUUID(), 
          content: content, 
          language: detectLanguage(content), 
          order: 0 
        }]);
      } else {
        // Empty default block
        setBlocks([{ 
          id: crypto.randomUUID(), 
          content: '', 
          language: 'text', 
          order: 0 
        }]);
      }
    } 
    // If switching from Jupyter style to standard
    else if (blocks.length > 0) {
      setContent(blocks[0].content);
    }
  };

  // Simple language detection based on content
  const detectLanguage = (content: string): string => {
    // Check for common language patterns
    if (content.includes('function') || content.includes('const ') || content.includes('let ')) {
      return 'javascript';
    }
    if (content.includes('def ') && content.includes(':')) {
      return 'python';
    }
    if (content.includes('<html') || content.includes('<div')) {
      return 'html';
    }
    if (content.includes('SELECT ') || content.includes('FROM ')) {
      return 'sql';
    }
    return 'text';
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
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26] text-base"
        />
      </div>
      
      {/* Paste Style Toggle */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
          Use Jupyter Notebook Style
        </span>
        <button 
          type="button"
          onClick={togglePasteStyle}
          className={`p-2 rounded-full transition-colors ${
            isJupyterStyle 
              ? 'bg-green-600 dark:bg-[#98971a] text-white dark:text-[#1d2021]' 
              : 'bg-gray-200 dark:bg-[#3c3836] text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-[#504945]'
          }`}
          aria-label={`${isJupyterStyle ? 'Disable' : 'Enable'} Jupyter Notebook Style`}
        >
          {isJupyterStyle ? (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
        </button>
      </div>
      
      {isJupyterStyle ? (
        <div className="jupyter-blocks space-y-2">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Paste Content Blocks
          </label>
          
          {jupyterError && (
            <div className="p-3 my-2 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded">
              {jupyterError}
            </div>
          )}
          
          {blocks.map(block => (
            <JupyterBlock
              key={block.id}
              content={block.content}
              language={block.language}
              order={block.order}
              isEditable={true}
              onContentChange={(newContent) => updateBlockContent(block.id, newContent)}
              onLanguageChange={(newLanguage) => updateBlockLanguage(block.id, newLanguage)}
              onDelete={() => removeBlock(block.id)}
            />
          ))}
          
          <div className="flex justify-center mt-4">
            <button
              type="button"
              onClick={addBlock}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 dark:bg-[#98971a] dark:text-[#1d2021] dark:hover:bg-[#79740e] flex items-center"
            >
              <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Block
            </button>
          </div>
        </div>
      ) : (
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
          className="mt-1 block w-full rounded-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] shadow-sm focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
        ></textarea>
          {formError && <p className="mt-1 text-sm text-red-600 dark:text-red-400">{formError}</p>}
      </div>
      )}
      
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
                <svg className="h-5 w-5 text-gray-400" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </span>
            </button>
            
            {isExpiryOpen && (
              <div className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-md bg-white dark:bg-[#282828] py-1 text-base shadow-lg ring-1 ring-black ring-opacity-5 focus:outline-none sm:text-sm">
                  {EXPIRY_OPTIONS.map((option) => (
                  <div
                      key={option.value}
                    className="cursor-pointer select-none px-4 py-2 text-gray-900 dark:text-[#ebdbb2] hover:bg-gray-100 dark:hover:bg-[#3c3836]"
                      onClick={() => handleExpirySelect(option.value)}
                    >
                      {option.label}
                  </div>
                  ))}
              </div>
            )}
          </div>
        </div>
        
        <div className="w-full">
          <label htmlFor="customUrl" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
            Custom URL (optional)
          </label>
          <div className="mt-1 flex rounded-md overflow-hidden">
            <span className="inline-flex items-center rounded-l-md border border-r-0 border-gray-300 dark:border-[#504945] bg-gray-50 dark:bg-[#3c3836] px-2 sm:px-3 text-gray-500 dark:text-gray-400 text-xs sm:text-sm whitespace-nowrap">
              pasteshare.ninja/
            </span>
            <input
              type="text"
              id="customUrl"
              placeholder="your-custom-url"
              value={customUrl}
              onChange={(e) => {
                const newUrl = e.target.value;
                setCustomUrl(newUrl);
                
                // Clear previous timeout
                if (urlCheckTimeout) {
                  clearTimeout(urlCheckTimeout);
                }
                
                // Clear error state immediately when typing
                setCustomUrlError(null);
                
                if (newUrl.trim()) {
                  // Debounce the URL check
                  const timeoutId = setTimeout(() => {
                    validateCustomUrl(newUrl);
                  }, 500);
                  setUrlCheckTimeout(timeoutId);
                } else {
                  setIsCheckingUrl(false);
                }
              }}
              className="block w-full flex-1 min-w-0 rounded-r-md border border-gray-300 dark:border-[#504945] bg-white dark:bg-[#282828] px-3 py-2 text-gray-900 dark:text-[#ebdbb2] focus:border-green-500 dark:focus:border-[#b8bb26] focus:ring-green-500 dark:focus:ring-[#b8bb26]"
            />
          </div>
          {isCheckingUrl && (
            <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">Checking availability...</p>
          )}
          {customUrlError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{customUrlError}</p>
          )}
        </div>
      </div>
      
      <div className="flex flex-col gap-4 sm:flex-row">
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isPrivate}
            onChange={() => setIsPrivate(!isPrivate)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-[#504945] dark:bg-[#282828] dark:focus:ring-[#b8bb26]"
          />
          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Private paste</span>
        </label>
        
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isEditable}
            onChange={() => setIsEditable(!isEditable)}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-[#504945] dark:bg-[#282828] dark:focus:ring-[#b8bb26]"
          />
          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Allow editing</span>
        </label>
        
        <label className="flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={isPasswordProtected}
            onChange={() => {
              setIsPasswordProtected(!isPasswordProtected);
              if (!isPasswordProtected) setPassword('');
              validatePassword(password);
            }}
            className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500 dark:border-[#504945] dark:bg-[#282828] dark:focus:ring-[#b8bb26]"
          />
          <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Password protect</span>
        </label>
      </div>
      
      {isPasswordProtected && (
        <div>
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
      
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          Attach Files (optional)
        </label>
        <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-300 dark:border-[#504945] border-dashed rounded-md">
          <div className="space-y-1 text-center">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              stroke="currentColor"
              fill="none"
              viewBox="0 0 48 48"
              aria-hidden="true"
            >
              <path
                d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <div className="flex text-sm text-gray-600 dark:text-gray-400">
          <label 
                htmlFor="file-upload"
                className="relative cursor-pointer rounded-md font-medium text-green-600 dark:text-[#b8bb26] hover:text-green-500 dark:hover:text-[#98971a] focus-within:outline-none"
              >
                <span>Upload files</span>
          <input
                  id="file-upload"
                  name="file-upload"
            type="file"
                  className="sr-only"
                  onChange={handleFileChange}
            multiple
                />
              </label>
              <p className="pl-1">or drag and drop</p>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              or <kbd className="px-1 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded">Ctrl+V</kbd> to paste images
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Up to 3 files, 10MB each
            </p>
          </div>
        </div>
        
        {fileError && (
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">{fileError}</p>
        )}
        
        {pasteSuccess && (
          <p className="mt-1 text-sm text-green-600 dark:text-green-400">{pasteSuccess}</p>
        )}
        
        {isPasting && (
          <p className="mt-1 text-sm text-blue-600 dark:text-blue-400">Processing image...</p>
        )}
      
      {files.length > 0 && (
          <div className="mt-4 space-y-2">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300">Selected Files:</h4>
            <ul className="space-y-2">
            {files.map((file, index) => (
                <li key={index} className="flex items-center justify-between bg-gray-50 dark:bg-[#3c3836] rounded-md p-2">
                <div className="flex items-center">
                    <span className="mr-2">{getFileIcon(file.name)}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{file.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">{formatFileSize(file.size)}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeFile(index)}
                    className="text-red-500 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                    </svg>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      </div>
      
      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isLoading}
          className={`px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 dark:bg-[#98971a] dark:text-[#1d2021] dark:hover:bg-[#79740e] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 dark:focus:ring-[#b8bb26] ${
            isLoading ? 'opacity-50 cursor-not-allowed' : ''
          }`}
        >
          {isLoading ? 'Creating...' : 'Create Paste'}
        </button>
      </div>
    </form>
  );
} 

// Global content validation function
export const globalContentValidation = () => {
  // The form now handles validation internally
  return () => {
    // Cleanup if needed
  };
}; 