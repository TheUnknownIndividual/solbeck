// google-oauth.js - Google OAuth Integration with Gmail API
import 'dotenv/config';
import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import fetch from 'node-fetch';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class GoogleOAuth {
  constructor() {
    this.CLIENT_ID = process.env.GOOGLE_CLIENT_ID || process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    this.CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
    this.REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'https://boltvoicebot.vercel.app/api/auth/google/callback';
    
    // Google OAuth endpoints
    this.AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
    this.TOKEN_URL = 'https://oauth2.googleapis.com/token';
    this.GMAIL_API_BASE = 'https://gmail.googleapis.com/gmail/v1';
    
    // Local storage paths
    this.SESSIONS_DIR = path.join(__dirname, 'sessions');
    this.MESSAGES_DIR = path.join(__dirname, 'message_history');
    
    this.init();
  }

  async init() {
    // Ensure directories exist
    await this.ensureDirectories();
  }

  async ensureDirectories() {
    try {
      await fs.mkdir(this.SESSIONS_DIR, { recursive: true });
      await fs.mkdir(this.MESSAGES_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating directories:', error);
    }
  }

  // Generate Google OAuth URL for Gmail permissions
  generateAuthURL(userId, state = null) {
    const stateParam = state || crypto.randomBytes(16).toString('hex');
    
    const params = new URLSearchParams({
      client_id: this.CLIENT_ID,
      redirect_uri: this.REDIRECT_URI,
      response_type: 'code',
      scope: 'https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile',
      state: `${userId}:${stateParam}`,
      access_type: 'offline',
      prompt: 'consent'
    });

    return `${this.AUTH_URL}?${params.toString()}`;
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code, userId) {
    try {
      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.CLIENT_ID,
          client_secret: this.CLIENT_SECRET,
          code: code,
          grant_type: 'authorization_code',
          redirect_uri: this.REDIRECT_URI
        }).toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token exchange failed: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const tokenData = await response.json();
      
      // Store tokens securely
      await this.storeUserTokens(userId, tokenData);
      
      return tokenData;
    } catch (error) {
      console.error('Token exchange error:', error);
      throw error;
    }
  }

  // Store user tokens with encryption
  async storeUserTokens(userId, tokenData) {
    try {
      const encryptionKey = crypto.randomBytes(32);
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', encryptionKey);
      
      const encrypted = cipher.update(JSON.stringify(tokenData), 'utf8', 'hex') + cipher.final('hex');
      const authTag = cipher.getAuthTag();

      const sessionData = {
        userId,
        encrypted,
        authTag: authTag.toString('hex'),
        encryptionKey: encryptionKey.toString('hex'),
        iv: iv.toString('hex'),
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString()
      };

      const sessionPath = path.join(this.SESSIONS_DIR, `${userId}.json`);
      await fs.writeFile(sessionPath, JSON.stringify(sessionData, null, 2));
      
      console.log(`Google OAuth tokens stored for user ${userId}`);
    } catch (error) {
      console.error('Error storing tokens:', error);
      throw error;
    }
  }

  // Retrieve and decrypt user tokens
  async getUserTokens(userId) {
    try {
      const sessionPath = path.join(this.SESSIONS_DIR, `${userId}.json`);
      const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));

      // Check if tokens are expired
      if (new Date() > new Date(sessionData.expiresAt)) {
        console.log(`Tokens expired for user ${userId}, attempting refresh...`);
        await this.refreshUserTokens(userId);
        return await this.getUserTokens(userId); // Recursive call after refresh
      }

      const decipher = crypto.createDecipher('aes-256-gcm', Buffer.from(sessionData.encryptionKey, 'hex'));
      decipher.setAuthTag(Buffer.from(sessionData.authTag, 'hex'));
      
      const decrypted = decipher.update(sessionData.encrypted, 'hex', 'utf8') + decipher.final('utf8');
      
      return JSON.parse(decrypted);
    } catch (error) {
      console.error(`Error retrieving tokens for user ${userId}:`, error);
      return null;
    }
  }

  // Refresh expired tokens
  async refreshUserTokens(userId) {
    try {
      const sessionPath = path.join(this.SESSIONS_DIR, `${userId}.json`);
      const sessionData = JSON.parse(await fs.readFile(sessionPath, 'utf8'));
      
      const decipher = crypto.createDecipher('aes-256-gcm', Buffer.from(sessionData.encryptionKey, 'hex'));
      decipher.setAuthTag(Buffer.from(sessionData.authTag, 'hex'));
      const decrypted = decipher.update(sessionData.encrypted, 'hex', 'utf8') + decipher.final('utf8');
      const tokenData = JSON.parse(decrypted);

      if (!tokenData.refresh_token) {
        throw new Error('No refresh token available - user needs to re-authenticate');
      }

      const response = await fetch(this.TOKEN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          client_id: this.CLIENT_ID,
          client_secret: this.CLIENT_SECRET,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token'
        }).toString()
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Token refresh failed: ${response.status} - ${errorText}`);
      }

      const newTokenData = await response.json();
      newTokenData.refresh_token = tokenData.refresh_token; // Preserve refresh token
      
      await this.storeUserTokens(userId, newTokenData);
      console.log(`Google OAuth tokens refreshed for user ${userId}`);
      
    } catch (error) {
      console.error(`Error refreshing tokens for user ${userId}:`, error);
      // Delete invalid session
      await this.clearUserSession(userId);
      throw error;
    }
  }

  // Send email using Gmail API
  async sendEmail(userId, emailData) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        throw new Error('User not authenticated with Google');
      }

      // Create email message in RFC2822 format
      const { to, subject, html, text } = emailData;
      const email = [
        `To: ${to}`,
        `Subject: ${subject}`,
        `Content-Type: text/html; charset=utf-8`,
        '',
        html || text || ''
      ].join('\n');

      // Encode email in base64url format
      const encodedEmail = Buffer.from(email).toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');

      const response = await fetch(`${this.GMAIL_API_BASE}/users/me/messages/send`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          raw: encodedEmail
        })
      });

      if (response.status === 401) {
        // Token expired, try refreshing
        console.log('Access token expired, refreshing...');
        await this.refreshUserTokens(userId);
        return await this.sendEmail(userId, emailData); // Retry
      }

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gmail API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`Email sent via Gmail API: ${result.id}`);
      return result;
    } catch (error) {
      console.error('Error sending email via Gmail:', error);
      throw error;
    }
  }

  // Get user profile from Google
  async getUserProfile(userId) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        return null;
      }

      const response = await fetch('https://www.googleapis.com/oauth2/v1/userinfo', {
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`
        }
      });

      if (response.status === 401) {
        // Token expired, try refreshing
        await this.refreshUserTokens(userId);
        return await this.getUserProfile(userId); // Retry
      }

      if (response.ok) {
        return await response.json();
      } else {
        return null;
      }
    } catch (error) {
      console.error('Error getting user profile:', error);
      return null;
    }
  }

  // Clear user session
  async clearUserSession(userId) {
    try {
      const sessionPath = path.join(this.SESSIONS_DIR, `${userId}.json`);
      await fs.unlink(sessionPath);
      console.log(`Google OAuth session cleared for user ${userId}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error clearing session:', error);
      }
    }
  }

  // Save message to local history
  async saveMessage(userId, message) {
    try {
      const messagesPath = path.join(this.MESSAGES_DIR, `${userId}.json`);
      let messages = [];
      
      try {
        const existingData = await fs.readFile(messagesPath, 'utf8');
        messages = JSON.parse(existingData);
      } catch (error) {
        // File doesn't exist, start with empty array
      }

      const messageEntry = {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        content: message.text || message,
        type: message.type || 'text',
        from: message.from || 'user'
      };

      messages.push(messageEntry);
      
      // Keep only last 1000 messages
      if (messages.length > 1000) {
        messages = messages.slice(-1000);
      }

      await fs.writeFile(messagesPath, JSON.stringify(messages, null, 2));
      
    } catch (error) {
      console.error('Error saving message:', error);
    }
  }

  // Load message history
  async loadMessageHistory(userId, limit = 50) {
    try {
      const messagesPath = path.join(this.MESSAGES_DIR, `${userId}.json`);
      const data = await fs.readFile(messagesPath, 'utf8');
      const messages = JSON.parse(data);
      
      // Return most recent messages
      return messages.slice(-limit).reverse();
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error loading message history:', error);
      }
      return [];
    }
  }

  // Clear message history
  async clearMessageHistory(userId) {
    try {
      const messagesPath = path.join(this.MESSAGES_DIR, `${userId}.json`);
      await fs.unlink(messagesPath);
      console.log(`Message history cleared for user ${userId}`);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error clearing message history:', error);
      }
    }
  }

  // Check if user is authenticated
  async isAuthenticated(userId) {
    const tokens = await this.getUserTokens(userId);
    return tokens !== null;
  }

  // Get authentication status and user info
  async getAuthStatus(userId) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        return { authenticated: false };
      }

      const userInfo = await this.getUserProfile(userId);
      
      if (userInfo) {
        return {
          authenticated: true,
          user: userInfo,
          permissions: tokens.scope ? tokens.scope.split(' ') : ['Gmail send access']
        };
      } else {
        return { authenticated: false };
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
      return { authenticated: false };
    }
  }

  // Revoke Google OAuth tokens
  async revokeTokens(userId) {
    try {
      const tokens = await this.getUserTokens(userId);
      if (!tokens) {
        return;
      }

      // Revoke the refresh token
      if (tokens.refresh_token) {
        await fetch(`https://oauth2.googleapis.com/revoke?token=${tokens.refresh_token}`, {
          method: 'POST'
        });
      }

      // Clear local session
      await this.clearUserSession(userId);
      console.log(`Google OAuth tokens revoked for user ${userId}`);
    } catch (error) {
      console.error('Error revoking tokens:', error);
    }
  }
}

export default GoogleOAuth;