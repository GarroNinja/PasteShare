import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiFetch, getApiBaseUrl } from '../lib/utils';

export function RawPastePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pasteInfo, setPasteInfo] = useState<any>(null);

  useEffect(() => {
    const fetchRawPaste = async () => {
      if (!id) {
        setError('No paste ID provided');
        setLoading(false);
        return;
      }

      try {
        // First try to get the raw content directly from API
        const apiBaseUrl = getApiBaseUrl();
        const response = await fetch(`${apiBaseUrl}/pastes/raw/${id}`);
        
        if (response.ok) {
          const rawContent = await response.text();
          setContent(rawContent);
        } else if (response.status === 400) {
          // Jupyter-style paste, redirect to regular view
          navigate(`/${id}`);
          return;
        } else if (response.status === 403) {
          // Password protected, get paste info first
          try {
            const pasteData = await apiFetch(`pastes/${id}`);
            setPasteInfo(pasteData.pasteInfo);
            setError('This paste is password protected');
          } catch (infoError) {
            setError('Paste not found or has expired');
          }
        } else {
          const errorText = await response.text();
          setError(errorText || 'Failed to load paste');
        }
      } catch (err) {
        console.error('Error fetching raw paste:', err);
        setError('Failed to load paste');
      } finally {
        setLoading(false);
      }
    };

    fetchRawPaste();
  }, [id, navigate]);

  const handlePasswordSubmit = async (password: string) => {
    if (!id) return;
    
    try {
      const apiBaseUrl = getApiBaseUrl();
      const response = await fetch(`${apiBaseUrl}/pastes/raw/${id}?password=${encodeURIComponent(password)}`);
      
      if (response.ok) {
        const rawContent = await response.text();
        setContent(rawContent);
        setError(null);
      } else {
        const errorText = await response.text();
        setError(errorText || 'Invalid password');
      }
    } catch (err) {
      setError('Failed to verify password');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        fontFamily: 'monospace', 
        padding: '20px', 
        backgroundColor: '#000', 
        color: '#fff', 
        minHeight: '100vh',
        margin: 0 
      }}>
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        fontFamily: 'monospace', 
        padding: '20px', 
        backgroundColor: '#000', 
        color: '#fff', 
        minHeight: '100vh',
        margin: 0 
      }}>
        <div>Error: {error}</div>
        
        {pasteInfo?.isPasswordProtected && (
          <div style={{ marginTop: '20px' }}>
            <div>This paste requires a password.</div>
            <div style={{ marginTop: '10px' }}>
              <input
                type="password"
                placeholder="Enter password"
                style={{
                  backgroundColor: '#333',
                  color: '#fff',
                  border: '1px solid #555',
                  padding: '5px',
                  fontFamily: 'monospace'
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePasswordSubmit((e.target as HTMLInputElement).value);
                  }
                }}
              />
              <button
                onClick={() => {
                  const input = document.querySelector('input[type="password"]') as HTMLInputElement;
                  if (input) handlePasswordSubmit(input.value);
                }}
                style={{
                  backgroundColor: '#555',
                  color: '#fff',
                  border: '1px solid #777',
                  padding: '5px 10px',
                  marginLeft: '10px',
                  fontFamily: 'monospace',
                  cursor: 'pointer'
                }}
              >
                Submit
              </button>
            </div>
          </div>
        )}
        
        <div style={{ marginTop: '20px' }}>
          <a 
            href={`/${id}`} 
            style={{ color: '#4a9eff', textDecoration: 'underline' }}
          >
            View in regular interface
          </a>
        </div>
      </div>
    );
  }

  return (
    <div style={{ 
      fontFamily: 'monospace', 
      padding: 0, 
      backgroundColor: '#000', 
      color: '#fff', 
      minHeight: '100vh',
      margin: 0,
      whiteSpace: 'pre-wrap'
    }}>
      {content}
    </div>
  );
} 