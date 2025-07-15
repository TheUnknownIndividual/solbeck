# Google OAuth Integration & Message History

## Overview

This implementation provides **Google OAuth integration** with **Gmail API** and **local message history storage** for the SolBeck Telegram bot. It solves the OAuth permission persistence issue and ensures message history is preserved across OAuth redirects.

## ✅ **Issues Fixed**

1. **OAuth permissions not persisting** - Now uses proper token storage and refresh
2. **Message history lost during redirects** - Local storage preserves all conversations
3. **Email sending failures** - Direct Gmail API integration with proper authentication

## 🚀 **Features**

### 🔐 Google OAuth Integration
- **Full OAuth 2.0 flow** with Google's APIs
- **Gmail API access** for sending emails
- **Secure token storage** with AES-256-GCM encryption
- **Automatic token refresh** when expired
- **Proper permission scopes** for Gmail sending

### 📚 Local Message History
- **Automatic message saving** for all user interactions
- **Local filesystem storage** (not cloud-dependent)
- **Message persistence** across OAuth redirects and bot restarts
- **History management** with viewing and cleanup options
- **1000 message limit** with automatic rotation

## 📁 **Files**

### Core Implementation
- `google-oauth.js` - Complete Google OAuth + Gmail API implementation
- `oauth-server.js` - OAuth callback server (port 3000)
- `telebot.js` - Updated with Google OAuth commands and middleware

### Configuration
- `.env` - Google OAuth environment variables
- `GOOGLE_OAUTH_README.md` - This documentation

## ⚙️ **Setup Instructions**

### 1. Vercel Environment Variables (Already Set!)

Your Vercel project already has these environment variables:
- ✅ `NEXT_PUBLIC_GOOGLE_CLIENT_ID`
- ✅ `GOOGLE_CLIENT_ID` 
- ✅ `GOOGLE_CLIENT_SECRET`

### 2. Add Required Redirect URI

You need to add this redirect URI to your Google Cloud Console OAuth configuration:

**Redirect URI to add:**
```
https://boltvoicebot.vercel.app/api/auth/google/callback
```

**How to add it:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** → **Credentials**
3. Click on your OAuth 2.0 Client ID
4. Under **Authorized redirect URIs**, click **+ ADD URI**
5. Add: `https://boltvoicebot.vercel.app/api/auth/google/callback`
6. Click **Save**

### 3. Verify Required Scopes

Ensure your Google Cloud Console project has these scopes enabled:
- ✅ `https://www.googleapis.com/auth/gmail.send` - Send emails via Gmail
- ✅ `https://www.googleapis.com/auth/userinfo.email` - User email access
- ✅ `https://www.googleapis.com/auth/userinfo.profile` - User profile access

### 4. Deploy to Vercel

The OAuth system works through Vercel API routes:
- **Auth Start**: `https://boltvoicebot.vercel.app/api/auth/google/start`
- **Auth Callback**: `https://boltvoicebot.vercel.app/api/auth/google/callback`
- **Success Page**: `https://boltvoicebot.vercel.app/auth/success`
- **Error Page**: `https://boltvoicebot.vercel.app/auth/error`

## 📱 **Bot Commands**

### Google OAuth Commands
- `/connect_google` - Start Google OAuth flow
- `/disconnect_google` - Disconnect and revoke tokens  
- `/google_status` - Check current Google connection status
- `/send_test_email` - Send test email through Gmail (requires authentication)

### Message History Commands
- `/message_history` - View recent message history (last 10 messages)
- `/clear_history` - Clear all message history for current user

## 🔄 **OAuth Flow**

1. User runs `/connect_google`
2. Bot generates Google OAuth URL
3. User clicks link → redirected to Google authorization
4. User grants permissions (Gmail send, profile access)
5. Google redirects back with authorization code
6. Bot exchanges code for access & refresh tokens
7. Tokens stored securely with encryption
8. User can now send emails through Gmail API

## 📋 **Message History**

### Automatic Saving
- **All user messages** automatically saved to local storage
- **All bot responses** automatically saved to local storage
- **Middleware intercepts** all communication for complete history

### Persistence Features
- **Survives OAuth redirects** - History preserved during authentication
- **Survives bot restarts** - Data stored on filesystem
- **User isolation** - Each user has separate history file
- **Automatic cleanup** - Keeps last 1000 messages per user

### Storage Location
```
/message_history/
  ├── [user_id].json    # Individual user message histories
```

## 🔐 **Security Features**

### Token Security
- **AES-256-GCM encryption** for all OAuth tokens
- **Unique encryption keys** per user session
- **No plaintext storage** of sensitive data
- **Automatic token refresh** with secure storage

### OAuth Security
- **HTTPS endpoints** for all Google API calls
- **State parameter validation** to prevent CSRF
- **Proper token revocation** on disconnect
- **Secure credential handling**

### Privacy Protection
- **Local storage only** - no cloud data storage
- **User data isolation** - users cannot access other's data
- **Message encryption** at rest
- **Automatic session cleanup**

## 🛠 **Troubleshooting**

### OAuth Issues

**"Permissions not persisting after redirect"**
- ✅ **FIXED**: Tokens now properly stored in encrypted sessions
- Check: `/google_status` to verify authentication state
- Check: `sessions/[user_id].json` file exists

**"OAuth popup fails"**
- Ensure OAuth server running on port 3000
- Verify Google OAuth credentials in `.env`
- Check redirect URI matches Google Cloud Console

**"Email sending fails"**
- Use `/google_status` to verify authentication
- Check if tokens need refreshing (automatic)
- Verify Gmail API permissions granted

### Message History Issues

**"History not saving"**
- Check write permissions for `message_history/` directory  
- Verify middleware is intercepting messages correctly
- Look for errors in bot console logs

**"History lost after OAuth"**
- ✅ **FIXED**: History now persists across OAuth redirects
- Message history completely independent of OAuth state
- Check: `message_history/[user_id].json` exists

## 🌐 **API Integration**

### Google OAuth Endpoints
- **Authorization**: `https://accounts.google.com/o/oauth2/v2/auth`
- **Token Exchange**: `https://oauth2.googleapis.com/token`
- **Token Revocation**: `https://oauth2.googleapis.com/revoke`

### Gmail API Endpoints  
- **Send Email**: `https://gmail.googleapis.com/gmail/v1/users/me/messages/send`
- **User Profile**: `https://www.googleapis.com/oauth2/v1/userinfo`

## 🧪 **Testing**

### Test OAuth Flow
```bash
# 1. Connect to Google
/connect_google

# 2. Complete authorization in browser

# 3. Verify connection
/google_status

# 4. Test email sending
/send_test_email
```

### Test Message History
```bash
# 1. Send various messages to bot

# 2. View message history
/message_history

# 3. Restart bot and verify persistence
/message_history
```

## 📊 **Directory Structure**

```
/sessions/              # Encrypted OAuth token storage
  ├── [user_id].json   # Individual user OAuth sessions
  
/message_history/       # Local message history storage  
  ├── [user_id].json   # Individual user message histories
```

## 🔧 **Environment Variables**

### Required for Local Development
```bash
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"
GOOGLE_REDIRECT_URI="http://localhost:3000/auth/google/callback"
```

### For Vercel Deployment
Use the same variable names in your Vercel environment configuration.

## ✅ **Implementation Status**

- ✅ **Google OAuth 2.0 integration** - Complete
- ✅ **Gmail API email sending** - Complete  
- ✅ **Token persistence & refresh** - Complete
- ✅ **Local message history storage** - Complete
- ✅ **Message history persistence across OAuth** - Complete
- ✅ **Secure token encryption** - Complete
- ✅ **Bot command integration** - Complete
- ✅ **Error handling & logging** - Complete

## 🆘 **Support**

The implementation includes comprehensive error handling and logging. For issues:

1. Check console logs for detailed error messages
2. Verify Google OAuth configuration in `.env` 
3. Test OAuth flow manually in browser developer tools
4. Check file permissions for storage directories
5. Verify Google Cloud Console OAuth setup

**All original OAuth permission persistence issues have been resolved with proper token storage and refresh mechanisms.**