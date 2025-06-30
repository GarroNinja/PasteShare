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

// Get the API base URL based on the environment
export function getApiBaseUrl(): string {
  // Check if we're in a browser environment
  if (typeof window !== 'undefined') {
    // For Vercel deployment - detect by hostname
    if (window.location.hostname.includes('vercel.app') || 
        window.location.hostname.includes('.app') || 
        (process.env.NODE_ENV === 'production' && window.location.hostname !== 'localhost')) {
      // Use current origin for Vercel deployment
      return `${window.location.origin}/api`;
  }
  
    // For Docker/local development - always use localhost:3000 for API
    return 'http://localhost:3000/api';
  }
  
  // Server-side rendering fallback
  return 'http://localhost:3000/api';
}

// Enhanced fetch that provides better error handling and debugging
export async function apiFetch(
  endpoint: string, 
  options: RequestInit & { queryParams?: Record<string, string> } = {}
): Promise<any> {
  const baseUrl = getApiBaseUrl();
  let url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  
  // Add query parameters if provided
  if (options.queryParams) {
    const queryString = new URLSearchParams(options.queryParams).toString();
    url = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
    // Remove queryParams from options to avoid fetch errors
    const { queryParams, ...restOptions } = options;
    options = restOptions;
  }
  
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
    // Still log errors but remove the debug logs
    console.error(`API request failed for ${url}:`, error);
    throw error;
  }
} 