// shared-storage.js - Shared storage system for OAuth tokens across services
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

class SharedStorage {
  constructor() {
    // Use multiple storage backends for reliability
    this.STORAGE_DIR = path.join(__dirname, 'oauth_storage');
    this.TELEGRAM_API_BASE = 'https://api.telegram.org/bot';
    this.BOT_TOKEN = process.env.BOT_TOKEN;
    
    this.init();
  }

  async init() {
    try {
      await fs.mkdir(this.STORAGE_DIR, { recursive: true });
    } catch (error) {
      console.error('Error creating storage directory:', error);
    }
  }

  // Store OAuth tokens with timestamp
  async storeTokens(userId, tokenData) {
    try {
      const storageData = {
        userId,
        tokens: tokenData,
        timestamp: new Date().toISOString(),
        status: 'active'
      };

      const filePath = path.join(this.STORAGE_DIR, `${userId}_oauth.json`);
      await fs.writeFile(filePath, JSON.stringify(storageData, null, 2));
      
      console.log(`OAuth tokens stored for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error storing tokens:', error);
      return false;
    }
  }

  // Retrieve OAuth tokens
  async getTokens(userId) {
    try {
      const filePath = path.join(this.STORAGE_DIR, `${userId}_oauth.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const storageData = JSON.parse(data);
      
      if (storageData.status === 'active') {
        return storageData.tokens;
      }
      
      return null;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error retrieving tokens:', error);
      }
      return null;
    }
  }

  // Check if user has active OAuth tokens
  async hasActiveTokens(userId) {
    const tokens = await this.getTokens(userId);
    return tokens !== null;
  }

  // Clear OAuth tokens
  async clearTokens(userId) {
    try {
      const filePath = path.join(this.STORAGE_DIR, `${userId}_oauth.json`);
      await fs.unlink(filePath);
      console.log(`OAuth tokens cleared for user ${userId}`);
      return true;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Error clearing tokens:', error);
      }
      return false;
    }
  }

  // Notify bot about OAuth completion via Telegram API
  async notifyBot(userId, success, message = null) {
    if (!this.BOT_TOKEN) {
      console.error('Bot token not available for notification');
      return false;
    }

    try {
      let notificationMessage;
      
      if (success) {
        notificationMessage = message || 
          `✅ <b>Google OAuth Successful!</b>\n\n` +
          `📧 Gmail permissions granted successfully.\n` +
          `🔐 Your authentication is now active.\n\n` +
          `You can now use email features! Try /send_test_email to test.`;
      } else {
        notificationMessage = message || 
          `❌ <b>Google OAuth Failed</b>\n\n` +
          `There was an issue with the authentication process.\n` +
          `Please try /connect_google again.`;
      }

      const telegramUrl = `${this.TELEGRAM_API_BASE}${this.BOT_TOKEN}/sendMessage`;
      const response = await fetch(telegramUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          chat_id: userId,
          text: notificationMessage,
          parse_mode: 'HTML'
        })
      });

      if (response.ok) {
        console.log(`Notification sent to user ${userId}`);
        return true;
      } else {
        console.error('Failed to send notification:', await response.text());
        return false;
      }
    } catch (error) {
      console.error('Error sending notification:', error);
      return false;
    }
  }

  // Get OAuth status for user
  async getOAuthStatus(userId) {
    try {
      const filePath = path.join(this.STORAGE_DIR, `${userId}_oauth.json`);
      const data = await fs.readFile(filePath, 'utf8');
      const storageData = JSON.parse(data);
      
      return {
        hasTokens: storageData.status === 'active',
        timestamp: storageData.timestamp,
        userId: storageData.userId
      };
    } catch (error) {
      return {
        hasTokens: false,
        timestamp: null,
        userId: userId
      };
    }
  }

  // Mark OAuth as pending (started but not completed)
  async markOAuthPending(userId) {
    try {
      const storageData = {
        userId,
        status: 'pending',
        timestamp: new Date().toISOString()
      };

      const filePath = path.join(this.STORAGE_DIR, `${userId}_oauth.json`);
      await fs.writeFile(filePath, JSON.stringify(storageData, null, 2));
      
      console.log(`OAuth marked as pending for user ${userId}`);
      return true;
    } catch (error) {
      console.error('Error marking OAuth as pending:', error);
      return false;
    }
  }

  // List all active OAuth users (for debugging)
  async listActiveUsers() {
    try {
      const files = await fs.readdir(this.STORAGE_DIR);
      const activeUsers = [];
      
      for (const file of files) {
        if (file.endsWith('_oauth.json')) {
          const userId = file.replace('_oauth.json', '');
          const status = await this.getOAuthStatus(userId);
          if (status.hasTokens) {
            activeUsers.push(userId);
          }
        }
      }
      
      return activeUsers;
    } catch (error) {
      console.error('Error listing active users:', error);
      return [];
    }
  }
}

export default SharedStorage;