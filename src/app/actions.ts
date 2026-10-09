'use server';

import { createClient } from '@supabase/supabase-js';
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';

const SECRET_KEY = new TextEncoder().encode(
  process.env.SESSION_SECRET_KEY || 'super-secret-fallback-key-for-dev-only-change-in-prod-1234567890'
);

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create a server-side Supabase client for auth checking
// Uses service role key to securely bypass RLS (since anon cannot read password hashes)
const supabase = createClient(
  supabaseUrl,
  supabaseServiceKey
);

export async function loginOrganizer(username: string, passwordRaw: string) {
  // Input validation
  const uname = username.trim().toLowerCase();
  if (uname.length < 3 || passwordRaw.length < 4) {
    return { error: "Username must be 3+ chars, password 4+ chars." };
  }

  // Rate Limiting (very simple global rate limiting could go here, but omitted for simplicity. 
  // In prod, use a Redis store or Supabase rate limits).

  // Fetch from DB
  const { data, error } = await supabase.from('organizers').select('*').eq('username', uname).single();
  
  if (error && error.code !== 'PGRST116') { // PGRST116 is not found
    return { error: `Database error: ${error.message}` };
  }

  if (data) {
    // User exists. Check if password is a bcrypt hash (starts with $2)
    const isHash = data.password.startsWith('$2');
    
    let isValid = false;
    if (isHash) {
      isValid = await bcrypt.compare(passwordRaw, data.password);
    } else {
      // Legacy plaintext password check. Update it to hash for future!
      isValid = (data.password === passwordRaw);
      if (isValid) {
        const hashed = await bcrypt.hash(passwordRaw, 10);
        await supabase.from('organizers').update({ password: hashed }).eq('username', uname);
      }
    }

    if (!isValid) {
      return { error: "Incorrect password for this username!" };
    }
  } else {
    // User doesn't exist, create it with hashed password!
    const hashed = await bcrypt.hash(passwordRaw, 10);
    const { error: insertError } = await supabase.from('organizers').insert([{ username: uname, password: hashed }]);
    if (insertError) {
      return { error: `Error creating account: ${insertError.message}` };
    }
  }

  // Set secure HTTP-only cookie
  const token = await new SignJWT({ username: uname })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(SECRET_KEY);

  const cookieStore = await cookies();
  cookieStore.set('session', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/'
  });

  return { success: true, username: uname };
}

export async function logoutOrganizer() {
  const cookieStore = await cookies();
  cookieStore.delete('session');
  return { success: true };
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get('session')?.value;

  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return payload;
  } catch (err) {
    return null;
  }
}
