require('dotenv').config();
console.log("DATABASE_URL configured:", !!process.env.DATABASE_URL);
if (process.env.DATABASE_URL) {
  const parts = process.env.DATABASE_URL.split('@');
  if (parts.length > 1) {
    console.log("Connection endpoint:", parts[1]);
  }
}
