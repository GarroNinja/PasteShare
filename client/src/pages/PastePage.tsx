import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/utils';

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
        const response = await fetch(`${getApiBaseUrl()}/pastes/${id}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError("Paste not found or has expired");
          } else {
            const errorData = await response.json();
            setError(errorData.message || "Failed to load paste");
          }
          setLoading(false);
          return;
        }
        
        const data = await response.json();
        
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

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      alert("Copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  };
  
  const copyLinkToClipboard = async () => {
    try {
      const currentUrl = window.location.href;
      await navigator.clipboard.writeText(currentUrl);
      alert("Link copied to clipboard!");
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
      
      console.log("Download response status:", response.status);
      console.log("Download response headers:", 
        Array.from(response.headers.entries())
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
      );
      
      if (!response.ok) {
        let errorMessage = 'Failed to download file: ' + response.status;
        try {
          const errorText = await response.text();
          console.error('Download error response:', errorText);
          if (errorText) {
            errorMessage += ` - ${errorText}`;
          }
        } catch (e) {
          console.error('Failed to get error text:', e);
        }
        throw new Error(errorMessage);
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
      const response = await fetch(`${getApiBaseUrl()}/pastes/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({
          title: editableTitle,
          content: editableContent,
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Failed to update paste');
      }
      
      const data = await response.json();
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
            {!isEditMode && (
              <>
                <button 
                  onClick={() => copyToClipboard(paste.content)}
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
          <pre className="p-4 overflow-x-auto font-mono text-sm bg-gray-50 dark:bg-[#1d2021] text-gray-800 dark:text-gray-200 whitespace-pre-wrap">
            {paste.content}
          </pre>
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