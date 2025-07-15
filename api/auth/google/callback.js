// api/auth/google/callback.js - Handle Google OAuth callback
import GoogleOAuth from '../../../google-oauth.js';
import SharedStorage from '../../../shared-storage.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sharedStorage = new SharedStorage();

  try {
    const { code, state, error } = req.query;

    if (error) {
      console.error('OAuth error:', error);
      
      // Extract userId from state if available
      const userId = state ? state.split(':')[0] : null;
      if (userId) {
        await sharedStorage.notifyBot(userId, false, `❌ OAuth failed: ${error}`);
      }
      
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
      
      // Store tokens in shared storage
      await sharedStorage.storeTokens(userId, tokenData);
      
      // Restore message history for user
      const messageHistory = await googleOAuth.loadMessageHistory(userId);
      
      console.log(`Google OAuth successful for user ${userId}, restored ${messageHistory.length} messages`);
      
      // Notify bot about successful OAuth
      await sharedStorage.notifyBot(userId, true, 
        `✅ <b>Google OAuth Successful!</b>\n\n` +
        `📧 Gmail permissions granted successfully.\n` +
        `📜 Message history restored: ${messageHistory.length} messages\n` +
        `🔐 Your authentication is now active.\n\n` +
        `You can now use email features! Try /send_test_email to test.`
      );
      
      // Redirect to success page
      res.redirect(`https://boltvoicebot.vercel.app/auth/success?messages=${messageHistory.length}`);
      
    } catch (tokenError) {
      console.error('Token exchange error:', tokenError);
      
      // Notify bot about failed OAuth
      await sharedStorage.notifyBot(userId, false, 
        `❌ <b>Google OAuth Failed</b>\n\n` +
        `Token exchange failed. Please try /connect_google again.`
      );
      
      res.redirect('https://boltvoicebot.vercel.app/auth/error?error=token_exchange_failed');
    }
    
  } catch (error) {
    console.error('Callback error:', error);
    res.redirect('https://boltvoicebot.vercel.app/auth/error?error=internal_error');
  }
}