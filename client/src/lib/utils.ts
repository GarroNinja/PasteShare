import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export const EXPIRY_OPTIONS = [
  { value: "300", label: "5 minutes" },
  { value: "3600", label: "1 hour" },
  { value: "86400", label: "1 day" },
  { value: "604800", label: "1 week" },
  { value: "2592000", label: "30 days" },
  { value: "31536000", label: "1 year" },
  { value: "0", label: "Never" },
];

export function getExpiryLabel(seconds: number) {
  const option = EXPIRY_OPTIONS.find((opt) => Number(opt.value) === seconds);
  return option ? option.label : "Custom";
}

export function getExpiryDate(seconds: number): Date | null {
  if (seconds === 0) return null;
  return new Date(Date.now() + seconds * 1000);
}

// Get the server API base URL
export function getApiBaseUrl(): string {
  // In production (Vercel deployment), use the current origin with /api path
  if (process.env.NODE_ENV === 'production') {
    const { protocol, host } = window.location;
    return `${protocol}//${host}/api`;
  }
  
  // Try to get the server port from localStorage (set in index.html)
  const serverPort = localStorage.getItem('api_port');
  if (serverPort) {
    // Clean up the port value in case it has non-numeric characters
    const cleanPort = serverPort.replace(/[^0-9]/g, '');
    return `http://localhost:${cleanPort}/api`;
  }
  
  // Default fallback for development
  return 'http://localhost:3000/api';
}

// Enhanced fetch that provides better error handling and debugging
export async function apiFetch(
  endpoint: string, 
  options: RequestInit = {}
): Promise<any> {
  const baseUrl = getApiBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  console.log(`Fetching from: ${url}`);
  
  try {
    // Add default headers and credentials
    const fetchOptions: RequestInit = {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...options.headers
      }
    };
    
    const response = await fetch(url, fetchOptions);
    
    // Log response status for debugging
    console.log(`Response from ${url}: status=${response.status}`);
    
    // Check if response is OK
    if (!response.ok) {
      // Try to parse error response as JSON
      try {
        const errorData = await response.json();
        throw new Error(errorData.message || `Request failed with status ${response.status}`);
      } catch (parseError) {
        // If parsing fails, throw a generic error with the status
        throw new Error(`Request failed with status ${response.status}`);
      }
    }
    
    // For non-GET requests to endpoints that don't return JSON, just return the response
    if (options.method && options.method !== 'GET' && response.headers.get('content-type')?.indexOf('application/json') === -1) {
      return response;
    }
    
    // Parse JSON response
    return await response.json();
  } catch (error) {
    console.error(`API request failed for ${url}:`, error);
    throw error;
  }
} 