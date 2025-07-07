# SOL Reclaimer Bot

A Telegram bot that helps Solana users reclaim SOL from empty token accounts and burn unwanted tokens.

## Features

- 🧹 **Empty Account Cleanup**: Automatically close empty token accounts and reclaim SOL rent
- 🔥 **Token Burning**: Permanently burn unwanted or inactive tokens
- 🔍 **Inactive Token Detection**: Identify tokens with no activity for 5+ days
- 💰 **Fee Collection**: 10% service fee on reclaimed SOL
- 🎯 **Gas Fee Coverage**: All transaction fees paid by the service
- 📊 **Comprehensive Stats**: Detailed analytics and reporting

## Prerequisites

- Node.js 18+ 
- A Telegram bot token
- A Solana wallet with SOL for transaction fees
- Alchemy RPC endpoint (or other Solana RPC)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/TheUnknownIndividual/solbeck.git
cd solbeck
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```
BOT_TOKEN=your_telegram_bot_token
FEE_PAYER_SECRET=your_fee_payer_private_key_base58
RPC_URL=https://solana-mainnet.g.alchemy.com/v2/your_api_key
FEE_COLLECTOR=your_fee_collector_solana_address
FEE_RATE=0.10
MINIMUM_RENT=890880
```

## Usage

1. Start the bot:
```bash
node telebot.js
```

2. In Telegram, interact with your bot:
   - `/start` - Begin the cleanup process
   - `/stats` - View comprehensive statistics
   - `/burntokens` - Start token burning workflow

## Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | Yes |
| `FEE_PAYER_SECRET` | Base58 encoded private key for paying transaction fees | Yes |
| `RPC_URL` | Solana RPC endpoint URL | Yes |
| `FEE_COLLECTOR` | Solana address to receive service fees | Yes |
| `FEE_RATE` | Fee percentage (0.10 = 10%) | No (default: 0.10) |
| `MINIMUM_RENT` | Minimum rent exemption in lamports | No (default: 890880) |

## How It Works

1. **Account Scanning**: The bot scans user wallets for token accounts
2. **Classification**: Identifies empty accounts and inactive tokens
3. **User Selection**: Users can choose which tokens to burn
4. **Transaction Processing**: Bot handles all transactions with fee collection
5. **SOL Reclamation**: Closes accounts and transfers reclaimed SOL minus fees

## Fee Structure

- **Service Fee**: 10% of all reclaimed SOL
- **Transaction Fees**: Paid by the service (no cost to users)
- **Minimum Processing**: Only processes amounts above dust threshold

## Security

- Private keys are encrypted in memory only
- No permanent storage of user credentials
- All transactions are simulated before execution
- Comprehensive error handling and validation

## Statistics

The bot tracks comprehensive metrics including:
- Total users and operations
- SOL reclaimed and fees collected
- Token burning analytics
- User activity patterns

## License

MIT License - see LICENSE file for details

## Support

For issues or questions, please open an issue on GitHub.