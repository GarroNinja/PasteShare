// This file will be processed by Vercel's serverless functions
// It imports and runs our Express server app
import '../server/dist/server';

// Export a handler function that Vercel can use
export default function handler(req, res) {
  // This function won't be called since our Express app handles all routes,
  // but it's required for Vercel's serverless function structure
} 