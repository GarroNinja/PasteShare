import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { CreatePasteForm } from "../components/create-paste-form";
import { getApiBaseUrl } from "../lib/utils";

export function HomePage() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleCreatePaste = async (data: {
    content: string;
    expiresIn: number;
    title: string;
    isPrivate: boolean;
    customUrl?: string;
    isEditable: boolean;
    files?: File[];
  }) => {
    setIsLoading(true);
    setError("");
    
    try {
      const formData = new FormData();
      formData.append("title", data.title);
      formData.append("content", data.content);
      formData.append("expiresIn", data.expiresIn.toString());
      formData.append("isPrivate", data.isPrivate ? "true" : "false");
      formData.append("isEditable", data.isEditable ? "true" : "false");
      
      if (data.customUrl) {
        formData.append("customUrl", data.customUrl);
      }
      
      // Add files to form data if they exist
      if (data.files && data.files.length > 0) {
        console.log(`Uploading ${data.files.length} files:`, data.files.map(f => f.name));
        data.files.forEach(file => formData.append("files", file));
      }
      
      // Get the API base URL
      const apiBaseUrl = getApiBaseUrl();
      console.log("Using API base URL:", apiBaseUrl);
      
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
      
      // Log response status
      console.log("Response status:", response.status);
      
      if (!response.ok) {
        let errorMessage = "Failed to create paste";
        try {
          const errorData = await response.json();
          errorMessage = errorData.message || errorMessage;
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
        throw new Error(errorMessage);
      }
      
      const result = await response.json();
      
      // Use the correct path to access the paste ID from the response
      console.log("Paste created successfully:", result);
      if (result.paste) {
        // If a custom URL is used, navigate to that
        if (result.paste.customUrl) {
          navigate(`/${result.paste.customUrl}`);
        } else if (result.paste.id) {
          navigate(`/${result.paste.id}`);
        } else {
          console.error("Invalid response structure:", result);
          setError("Failed to create paste: Invalid server response");
          setIsLoading(false);
        }
      } else {
        console.error("Invalid response structure:", result);
        setError("Failed to create paste: Invalid server response");
        setIsLoading(false);
      }
      
    } catch (error) {
      console.error("Error creating paste:", error);
      setError(error instanceof Error ? error.message : "Failed to create paste");
      setIsLoading(false);
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
        {error && <p className="mt-3 text-red-600 dark:text-red-400">{error}</p>}
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
          <h3 className="font-semibold text-lg mb-2">Collaborative Editing</h3>
          <p className="text-gray-600 dark:text-gray-300">
            Allow others to edit and improve your shared pastes.
          </p>
        </div>
      </div>
    </div>
  );
} 