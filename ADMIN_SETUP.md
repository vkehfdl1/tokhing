# Admin Page Setup Instructions

## Overview

This admin page provides secure password-based authentication for administrators. It uses client-side password hashing for security without requiring a server.

## Security Features

- **Password Hashing**: Passwords are hashed using SHA-256 before comparison
- **No Plain Text Storage**: Only password hashes are stored in environment variables
- **Session-based Authentication**: Uses browser sessionStorage to maintain login state
- **Auto-logout**: Session expires when browser is closed

## Setup Instructions

### 1. Generate Password Hash

Run the hash generation script with your desired admin password:

```bash
node scripts/generate-admin-hash.js your-strong-password
```

Example:

```bash
node scripts/generate-admin-hash.js admin123
```

This will output something like:

```
🔐 Admin Password Hash Generated
================================
Add this to your .env.local file:
NEXT_PUBLIC_ADMIN_PASSWORD_HASH=240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9
```

### 2. Update Environment Variables

Copy the generated hash and add it to your `.env.local` file:

```env
NEXT_PUBLIC_ADMIN_PASSWORD_HASH=your_generated_hash_here
```

### 3. Access Admin Page

1. Start your Next.js development server: `npm run dev`
2. Navigate to `/admin` in your browser
3. Enter your admin password (the original password, not the hash)
4. Access the admin dashboard

## Security Considerations

### ✅ What this approach provides:

- Password is not stored in plain text
- Brute force protection through client-side rate limiting
- Session expires when browser closes
- Hash comparison prevents direct password exposure

### ⚠️ Important Security Notes:

- **Client-side limitation**: The hash is visible in the client bundle (this is expected for client-only auth)
- **Use HTTPS**: Always serve your production app over HTTPS
- **Strong passwords**: Use complex passwords with letters, numbers, and special characters
- **Regular rotation**: Consider changing the admin password periodically
- **Environment security**: Keep your `.env.local` file secure and never commit it to version control

### 🔒 For Enhanced Security:

If you need server-side authentication later, consider:

- Implementing proper server-side authentication with JWT tokens
- Using a database to store hashed passwords with salt
- Implementing rate limiting and account lockouts
- Adding two-factor authentication (2FA)

## Current Password

For testing purposes, the current password is set to: **admin123**

⚠️ **Change this immediately for production use!**

## Changing the Admin Password

1. Generate a new hash:

   ```bash
   node scripts/generate-admin-hash.js new-secure-password
   ```

2. Update the `NEXT_PUBLIC_ADMIN_PASSWORD_HASH` in your `.env.local` file

3. Restart your development server

## File Structure

```
app/admin/page.tsx          # Main admin page with authentication
scripts/generate-admin-hash.js  # Password hash generation utility
.env.local                  # Environment variables (not in git)
.env.local.example         # Example environment file
```
