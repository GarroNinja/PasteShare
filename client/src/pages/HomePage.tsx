import React, { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { CreatePasteForm } from "../components/CreatePasteForm";
import { getApiBaseUrl } from "../lib/utils";

export function HomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  // Track whether we're currently creating a paste to avoid React DOM errors
  const isCreatingPaste = useRef(false);

  const handleCreatePaste = async (data: {
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
  }) => {
    // Prevent multiple submissions
    if (isCreatingPaste.current || isLoading) {
      return;
    }

    setIsLoading(true);
    setError("");
    isCreatingPaste.current = true;
    
    try {
      // Create a new FormData instance
      const formData = new FormData();
      
      // Add title
      formData.append("title", data.title || "Untitled Paste");
      
      
      
      // Handle Jupyter-style pastes differently
      if (data.isJupyterStyle) {
        // Explicitly set isJupyterStyle flag
        formData.append("isJupyterStyle", "true");
        
        // Process blocks
        if (data.blocks && data.blocks.length > 0) {
          try {
            // Filter out completely empty blocks
            const nonEmptyBlocks = data.blocks.filter(block => block.content.trim());
            
            if (nonEmptyBlocks.length === 0) {
              throw new Error("At least one block must have content");
            }
            
            // Clean and reorder blocks to ensure proper order
            const processedBlocks = nonEmptyBlocks.map((block, index) => ({
              content: block.content.trim(),
              language: block.language || 'text',
              order: index
            }));
            
            
            
            // Convert blocks to JSON string
            const blocksJson = JSON.stringify(processedBlocks);
            
            // Add the blocks as JSON string to form data
            formData.append("blocks", blocksJson);
            
            // Add dummy content to satisfy server validation
            formData.append("content", "dummy-content-for-jupyter");
          } catch (jsonError) {
            console.error("Error preparing blocks:", jsonError);
            setError("Error preparing blocks: " + (jsonError instanceof Error ? jsonError.message : String(jsonError)));
            setIsLoading(false);
            isCreatingPaste.current = false;
            return;
          }
        } else {
          setError("Jupyter style paste requires at least one block with content");
          setIsLoading(false);
          isCreatingPaste.current = false;
          return;
        }
      } else {
        // Standard paste handling
        if (!data.content.trim()) {
          setError("Content is required for standard pastes");
          setIsLoading(false);
          isCreatingPaste.current = false;
          return;
        }
        
        formData.append("content", data.content);
        formData.append("isJupyterStyle", "false");
      }
      
      // Add common form fields
      formData.append("expiresIn", data.expiresIn.toString());
      formData.append("isPrivate", data.isPrivate ? "true" : "false");
      formData.append("isEditable", data.isEditable ? "true" : "false");
      
      if (data.customUrl) {
        formData.append("customUrl", data.customUrl);
      }
      
      // Add password if provided
      if (data.password) {
        formData.append("password", data.password);
      }
      
      // Add files to form data if they exist
      if (data.files && data.files.length > 0) {
        data.files.forEach(file => formData.append("files", file));
      }
      
      // Get the API base URL
      const apiBaseUrl = getApiBaseUrl();
      
      // Make API call with explicit mode and credentials
      const response = await fetch(`${apiBaseUrl}/pastes`, {
        method: "POST",
        body: formData,
        credentials: "include",
        mode: "cors",
        headers: {
          'Accept': 'application/json'
        },
      });
      
      // Handle error responses
      if (!response.ok) {
        let errorMessage = "Failed to create paste";
        let errorDetails = "";
        
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
          errorDetails = JSON.stringify(errorData);
          console.error("Error response data:", errorData);
        } catch (e) {
          console.error("Failed to parse error response:", e);
          // If we can't parse JSON, try to get the text
          try {
            const errorText = await response.text();
            console.error("Error response text:", errorText);
            if (errorText) {
              errorMessage = `Failed to create paste: ${response.status} - ${errorText.substring(0, 100)}`;
            } else {
              errorMessage = `Failed to create paste: HTTP ${response.status}`;
            }
          } catch (textError) {
            console.error("Failed to get error text:", textError);
            errorMessage = `Failed to create paste: HTTP ${response.status}`;
          }
        }
        
        throw new Error(`${errorMessage}\n${errorDetails}`);
      }
      
      // Parse successful response
      const result = await response.json();
      
      if (result.paste && result.paste.id) {
        // Use a timeout to avoid navigation race conditions that might cause page glitches
        setTimeout(() => {
        // If a custom URL is used, navigate to that
        if (result.paste.customUrl) {
          navigate(`/${result.paste.customUrl}`);
          } else {
          navigate(`/${result.paste.id}`);
        }
        }, 100);
      } else {
        console.error("Invalid response structure:", result);
        setError("Failed to create paste: Invalid server response");
        setIsLoading(false);
        isCreatingPaste.current = false;
      }
      
    } catch (error) {
      console.error("Error creating paste:", error);
      setError(error instanceof Error ? error.message : "Failed to create paste");
      setIsLoading(false);
      isCreatingPaste.current = false;
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 min-h-[80vh]">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold mb-2">Share Code & Files Instantly</h1>
        <p className="text-lg text-gray-600 dark:text-gray-300">
          A simple, fast and secure way to share your code snippets and files with anyone.
        </p>
      </div>

      <div className="bg-white dark:bg-[#282828] rounded-lg shadow-sm border border-gray-200 dark:border-[#3c3836] p-6">
        <CreatePasteForm onSubmit={handleCreatePaste} isLoading={isLoading} />
        {error && (
          <div className="mt-3 p-3 bg-red-100 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-sm rounded whitespace-pre-wrap">
            {error}
          </div>
        )}
      </div>

      <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#282828] p-4 rounded-lg border border-gray-200 dark:border-[#3c3836]">
          <h3 className="font-semibold text-lg mb-2">Custom URLs</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Create memorable custom URLs for easier sharing and access.
          </p>
        </div>
        
        <div className="bg-white dark:bg-[#282828] p-4 rounded-lg border border-gray-200 dark:border-[#3c3836]">
          <h3 className="font-semibold text-lg mb-2">File Attachments</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Upload and share files alongside your text pastes.
          </p>
        </div>
        
        <div className="bg-white dark:bg-[#282828] p-4 rounded-lg border border-gray-200 dark:border-[#3c3836]">
          <h3 className="font-semibold text-lg mb-2">Jupyter Notebook</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Create and share multi-language notebook-style documents with blocks.
          </p>
        </div>
      </div>
    </div>
  );
} 