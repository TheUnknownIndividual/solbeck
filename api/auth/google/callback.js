// api/auth/google/callback.js - Handle Google OAuth callback
import GoogleOAuth from '../../../google-oauth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth error:', error);
      return res.redirect(`https://boltvoicebot.vercel.app/auth/error?error=${encodeURIComponent(error)}`);
    }

    if (!code || !state) {
      return res.redirect('https://boltvoicebot.vercel.app/auth/error?error=missing_code_or_state');
    }

    // Extract userId from state
    const [userId] = state.split(':');
    
    if (!userId) {
      return res.redirect('https://boltvoicebot.vercel.app/auth/error?error=invalid_state');
    }

    const googleOAuth = new GoogleOAuth();
    
    try {
      // Exchange code for tokens
      const tokenData = await googleOAuth.exchangeCodeForToken(code, userId);
      
      // Restore message history for user
      const messageHistory = await googleOAuth.loadMessageHistory(userId);
      
      console.log(`Google OAuth successful for user ${userId}, restored ${messageHistory.length} messages`);
      
      // Redirect to success page
      res.redirect(`https://boltvoicebot.vercel.app/auth/success?messages=${messageHistory.length}`);
      
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      res.redirect('https://boltvoicebot.vercel.app/auth/error?error=token_exchange_failed');
    }
    
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect('https://boltvoicebot.vercel.app/auth/error?error=internal_error');
  }
}