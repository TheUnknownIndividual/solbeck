// api/auth/google/start.js - Initiate Google OAuth flow
import GoogleOAuth from '../../../google-oauth.js';
import SharedStorage from '../../../shared-storage.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sharedStorage = new SharedStorage();

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId parameter' });
    }

    const googleOAuth = new GoogleOAuth();
    
    // Mark OAuth as pending
    await sharedStorage.markOAuthPending(userId);
    
    // Generate OAuth URL
    const authUrl = googleOAuth.generateAuthURL(userId);
    
    console.log(`OAuth started for user ${userId}`);
    
    // Redirect to Google OAuth
    res.redirect(authUrl);
    
  } catch (error) {
    console.error('Auth start error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}