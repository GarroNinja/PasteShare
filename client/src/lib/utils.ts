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
  // Check if server port is defined in window object (set by the server during development)
  // @ts-ignore
  const serverPort = window.SERVER_PORT || '3000';
  
  // Check if we're in production environment
  if (process.env.NODE_ENV === 'production') {
    // For Vercel deployment, use the current hostname with /api path
    const { protocol, host } = window.location;
    return `${protocol}//${host}/api`;
  }
  
  // Try to get the port from the public directory if available
  try {
    // Development environment - use dynamic port lookup
    return `http://localhost:${serverPort}/api`;
  } catch (error) {
    console.warn('Failed to read server port, using default 3003:', error);
    // Fallback to common development ports
    return 'http://localhost:3003/api';
  }
} 