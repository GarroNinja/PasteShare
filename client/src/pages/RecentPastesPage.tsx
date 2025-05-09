import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getApiBaseUrl } from '../lib/utils';

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

  // Helper function to truncate paste content
  const truncateContent = (content: string, maxLength = 100) => {
    if (content.length <= maxLength) return content;
    return content.substring(0, maxLength) + '...';
  };

  useEffect(() => {
    const fetchPastes = async () => {
      try {
        const response = await fetch(`${getApiBaseUrl()}/pastes`, {
          method: 'GET',
          credentials: 'include',
          mode: 'cors',
        });
        
        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.message || 'Failed to fetch pastes');
        }
        
        const data = await response.json();
        
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

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Recent Pastes</h1>
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
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-6">Recent Pastes</h1>
        <div className="bg-red-100 dark:bg-red-900 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-red-600 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Recent Pastes</h1>
      
      {pastes.length === 0 ? (
        <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] p-8 text-center">
          <p className="text-gray-500 dark:text-gray-400">No pastes available.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {pastes.map(paste => (
            <Link
              key={paste.id}
              to={`/paste/${paste.customUrl || paste.id}`}
              className="block bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] hover:border-green-300 dark:hover:border-green-700 transition-colors"
            >
              <div className="p-4">
                <h2 className="text-lg font-medium mb-2">{paste.title || 'Untitled Paste'}</h2>
                <pre className="overflow-hidden text-ellipsis whitespace-nowrap bg-gray-50 dark:bg-[#1d2021] p-2 rounded text-sm font-mono">
                  {truncateContent(paste.content)}
                </pre>
                <div className="mt-2 flex justify-between text-xs text-gray-500 dark:text-gray-400">
                  <span>Created: {new Date(paste.createdAt).toLocaleString()}</span>
                  <div className="flex items-center gap-2">
                    {paste.customUrl && (
                      <span className="px-2 py-0.5 bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-300 rounded-full">
                        {paste.customUrl}
                      </span>
                    )}
                    <span>{paste.views} views</span>
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
} 