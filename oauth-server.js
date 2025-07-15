// oauth-server.js - Google OAuth Callback Server
import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import GoogleOAuth from './google-oauth.js';

class OAuthServer {
  constructor(port = 3000) {
    this.port = port;
    this.oauth = new GoogleOAuth();
    this.pendingAuth = new Map(); // Store pending auth requests
  }

  start() {
    const server = createServer(async (req, res) => {
      const parsedUrl = parse(req.url, true);
      
      if (parsedUrl.pathname === '/auth/google/callback') {
        await this.handleCallback(req, res, parsedUrl.query);
      } else if (parsedUrl.pathname === '/auth/google/start') {
        await this.handleAuthStart(req, res, parsedUrl.query);
      } else {
        this.sendResponse(res, 404, 'Not Found');
      }
    });

    server.listen(this.port, () => {
      console.log(`OAuth server running on http://localhost:${this.port}`);
    });

    return server;
  }

  async handleAuthStart(req, res, query) {
    try {
      const { userId } = query;
      
      if (!userId) {
        this.sendResponse(res, 400, 'Missing userId parameter');
        return;
      }

      // Generate OAuth URL
      const authUrl = this.oauth.generateAuthURL(userId);
      
      // Store pending auth request
      this.pendingAuth.set(userId, {
        timestamp: Date.now(),
        redirectUrl: authUrl
      });

      // Redirect to OAuth provider
      res.writeHead(302, { 'Location': authUrl });
      res.end();
      
    } catch (error) {
      console.error('Auth start error:', error);
      this.sendResponse(res, 500, 'Internal server error');
    }
  }

  async handleCallback(req, res, query) {
    try {
      const { code, state, error } = query;

      if (error) {
        console.error('OAuth error:', error);
        await this.sendSuccessPage(res, false, `OAuth error: ${error}`);
        return;
      }

      if (!code || !state) {
        await this.sendSuccessPage(res, false, 'Missing authorization code or state');
        return;
      }

      // Extract userId from state
      const [userId] = state.split(':');
      
      if (!userId) {
        await this.sendSuccessPage(res, false, 'Invalid state parameter');
        return;
      }

      try {
        // Exchange code for tokens
        const tokenData = await this.oauth.exchangeCodeForToken(code, userId);
        
        // Clear pending auth
        this.pendingAuth.delete(userId);
        
        // Restore message history for user
        const messageHistory = await this.oauth.loadMessageHistory(userId);
        
        console.log(`Google OAuth successful for user ${userId}, restored ${messageHistory.length} messages`);
        
        await this.sendSuccessPage(res, true, 'Google authentication successful! Gmail permissions granted. You can now close this window and return to the bot.');
        
      } catch (tokenError) {
        console.error('Token exchange error:', tokenError);
        await this.sendSuccessPage(res, false, 'Failed to complete authentication');
      }
      
    } catch (error) {
      console.error('Callback error:', error);
      await this.sendSuccessPage(res, false, 'Internal server error');
    }
  }

  async sendSuccessPage(res, success, message) {
    const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Google OAuth - ${success ? 'Success' : 'Error'}</title>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            margin: 0;
            background: ${success ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)'};
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0,0,0,0.1);
            text-align: center;
            max-width: 400px;
            width: 90%;
        }
        .icon {
            font-size: 3rem;
            margin-bottom: 1rem;
        }
        .success { color: #10b981; }
        .error { color: #ef4444; }
        h1 {
            color: #374151;
            margin-bottom: 0.5rem;
            font-size: 1.5rem;
        }
        p {
            color: #6b7280;
            line-height: 1.5;
            margin-bottom: 1.5rem;
        }
        .button {
            background: ${success ? '#10b981' : '#ef4444'};
            color: white;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            cursor: pointer;
            font-size: 1rem;
            transition: opacity 0.2s;
        }
        .button:hover {
            opacity: 0.9;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="icon ${success ? 'success' : 'error'}">
            ${success ? '✅' : '❌'}
        </div>
        <h1>${success ? 'Authentication Successful!' : 'Authentication Failed'}</h1>
        <p>${message}</p>
        <button class="button" onclick="window.close()">
            Close Window
        </button>
    </div>
    <script>
        // Auto-close after 5 seconds if successful
        ${success ? 'setTimeout(() => window.close(), 5000);' : ''}
    </script>
</body>
</html>`;
    
    res.writeHead(200, {
      'Content-Type': 'text/html',
      'Content-Length': Buffer.byteLength(html)
    });
    res.end(html);
  }

  sendResponse(res, statusCode, message) {
    res.writeHead(statusCode, { 'Content-Type': 'text/plain' });
    res.end(message);
  }

  // Get pending auth status
  getPendingAuth(userId) {
    return this.pendingAuth.get(userId);
  }

  // Clear pending auth
  clearPendingAuth(userId) {
    this.pendingAuth.delete(userId);
  }

  // Clean up expired pending auths (older than 10 minutes)
  cleanupPendingAuths() {
    const now = Date.now();
    const expiry = 10 * 60 * 1000; // 10 minutes

    for (const [userId, authData] of this.pendingAuth.entries()) {
      if (now - authData.timestamp > expiry) {
        this.pendingAuth.delete(userId);
      }
    }
  }
}

export default OAuthServer;