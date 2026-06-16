// js/supabase.js

// ดึงตัวแปรมาจาก Project Settings ใน Supabase
const SUPABASE_URL = 'https://mcejrlulpatdorrjwbax.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1jZWpybHVscGF0ZG9ycmp3YmF4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA3MTA4MDEsImV4cCI6MjA5NjI4NjgwMX0.VLzY2zCFcAdoJcxvGsNLtOfsZiWZdSNGUBnKKQKf_5w';

// สร้าง Client (สมมติว่าดึง script จาก CDN มาแล้วใน HTML)
const supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);