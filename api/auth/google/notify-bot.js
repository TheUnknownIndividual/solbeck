// api/auth/google/notify-bot.js - Notify bot about OAuth completion
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, success, tokens } = req.body;
    
    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Get bot token from environment
    const BOT_TOKEN = process.env.BOT_TOKEN;
    if (!BOT_TOKEN) {
      return res.status(500).json({ error: 'Bot token not configured' });
    }

    // Prepare notification message
    let message;
    if (success) {
      message = `✅ <b>Google OAuth Successful!</b>\n\n` +
                `📧 Gmail permissions granted successfully.\n` +
                `🔐 Your authentication is now active.\n\n` +
                `You can now use email features! Try /send_test_email to test.`;
    } else {
      message = `❌ <b>Google OAuth Failed</b>\n\n` +
                `There was an issue with the authentication process.\n` +
                `Please try /connect_google again.`;
    }

    // Send notification to user via Telegram
    const telegramUrl = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
    const response = await fetch(telegramUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: userId,
        text: message,
        parse_mode: 'HTML'
      })
    });

    if (!response.ok) {
      console.error('Failed to send Telegram notification:', await response.text());
    }

    res.status(200).json({ success: true });
    
  } catch (error) {
    console.error('Notify bot error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}