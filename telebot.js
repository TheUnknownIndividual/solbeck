// bot.js
import 'dotenv/config'; 

import { Telegraf, Markup } from 'telegraf';
import crypto from 'crypto';
import bs58 from 'bs58';
import fs from 'fs/promises';
import path from 'path';
import fetch from 'node-fetch';
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  SendTransactionError,
} from '@solana/web3.js';
import {
  TOKEN_PROGRAM_ID,
  createCloseAccountInstruction,
  createBurnInstruction,
  getAccount,
  getMint,
} from '@solana/spl-token';

// ===== MULTILINGUAL SUPPORT SYSTEM =====
const TRANSLATIONS = {
  en: {
    welcome: "🤖 <b>Welcome to SolBeck!</b>\n\n🔥 <b>Multi-Wallet Token Burner & SOL Reclaimer</b>\n\n✨ <b>What I can do:</b>\n• Burn unwanted tokens from multiple wallets\n• Close empty token accounts to reclaim SOL rent\n• Consolidate SOL from multiple wallets\n• Handle large batches (up to 100 wallets)\n\n🚀 <b>Ready to optimize your wallets?</b>",
    referral_welcome: "🎉 <b>Welcome to SolBeck!</b>\n\n🌟 <b>You're a valued member of the Magnum Community!</b>\n\nAs a special thank you for your support, you'll enjoy <b>feeless service</b> for all operations! 🎁\n\n✨ <b>What I can do:</b>\n• Burn unwanted tokens from multiple wallets\n• Close empty token accounts to reclaim SOL rent\n• Consolidate SOL from multiple wallets\n• Handle large batches (up to 100 wallets)\n\n🚀 <b>Ready to optimize your wallets?</b>",
    get_started: "🚀 Get Started",
    burn_tokens: "🔥 Burn Tokens Only",
    provide_keys: "🔑 <b>Provide Your Private Keys</b>\n\n📝 Send me your private keys (one per line or separated by spaces/commas):\n\n⚠️ <b>Security Notes:</b>\n• Keys are encrypted and never stored permanently\n• Only you can see this conversation\n• Keys are deleted after processing\n• Up to 100 wallets supported\n\n💡 <b>Example format:</b>\n<code>3X4mF8...\n9Z2nK7...\n6A1sD9...</code>",
    provide_keys_burn: "🔥 <b>Provide Keys for Token Burning</b>\n\n📝 Send me your private keys (one per line or separated by spaces/commas):\n\n⚠️ <b>Security Notes:</b>\n• Keys are encrypted and never stored permanently\n• Only you can see this conversation\n• Keys are deleted after processing\n• Up to 100 wallets supported\n\n💡 <b>Example format:</b>\n<code>3X4mF8...\n9Z2nK7...\n6A1sD9...</code>",
    invalid_key: "❌ Invalid Base58 key detected—please /start again.",
    invalid_key_burn: "❌ Invalid Base58 key detected—please /burntokens again.",
    scanning: "🔍 Scanning your wallets for tokens...",
    scanning_burn: "🔍 Scanning your wallets for tokens to burn...",
    scan_error: "❌ Error scanning your wallets. Please try again with /start.",
    scan_error_burn: "❌ Error scanning your wallets. Please try again with /burntokens.",
    bad_secret_key: "❌ Invalid private key format detected. Please ensure all private keys are valid 64-character Base58 strings. Use /start to try again.",
    bad_secret_key_burn: "❌ Invalid private key format detected. Please ensure all private keys are valid 64-character Base58 strings. Use /burntokens to try again.",
    invalid_key_error: "❌ One or more private keys are invalid. Please check your keys and try again with /start.",
    invalid_key_error_burn: "❌ One or more private keys are invalid. Please check your keys and try again with /burntokens.",
    consolidate_yes: "✅ Consolidate all SOL",
    consolidate_no: "❌ Keep SOL in wallets",
    provide_address: "📮 <b>Provide Payout Address</b>\n\nPlease send me the Solana address where you'd like to receive your consolidated SOL:",
    invalid_address: "❌ Invalid Solana address. Please provide a valid address.",
    processing: "⚙️ Processing your request...\n\n⏳ This may take a few moments for large batches.",
    no_actions: "ℹ️ No actions were taken. Your wallets are already optimized!",
    success: "✅ <b>Success!</b>",
    burned_tokens: "🔥 <b>Burned {} tokens:</b>",
    closed_accounts: "🧹 <b>Closed {} empty accounts</b>",
    consolidated_sol: "💰 <b>Consolidated {} SOL</b> → {}",
    reclaimed_sol: "🪙 <b>Reclaimed {} SOL</b> from rent",
    fees_collected: "💸 <b>Service fee:</b> {} SOL",
    net_received: "💵 <b>Net received:</b> {} SOL",
    usd_value: "💵 <b>USD value:</b> ${}",
    transaction_link: "🔗 <b>Transaction:</b> <a href=\"https://solscan.io/tx/{}\">View on Solscan</a>",
    stats_title: "📊 <b>Your SolBeck Statistics</b>",
    stats_wallets: "🔑 <b>Total wallets processed:</b> {}",
    stats_tokens: "🔥 <b>Total tokens burned:</b> {}",
    stats_accounts: "🧹 <b>Total accounts closed:</b> {}",
    stats_sol: "💰 <b>Total SOL reclaimed:</b> {} SOL",
    stats_none: "📊 <b>No statistics yet</b>\n\nUse /start to begin optimizing your wallets!",
    language_detect: "🌐 Language set to English",
    language_switch: "🔄 Language",
    welcome_to: "👋 <b>Welcome to solbeck, {}!</b>",
    what_we_offer: "💰 <b>What we offer:</b>\n• Close empty token accounts & reclaim SOL rent\n• Detect inactive token accounts (5+ days)\n• Optimize wallet storage automatically\n• Safe & secure in-memory processing",
    rewards_fees: "🎯 <b>Rewards & Fees:</b>\n• ~0.002 SOL per closed account\n• We take a 10% service fee from reclaimed SOL\n• You keep 90% of all reclaimed SOL",
    no_sol_needed: "🎆 <b>No SOL needed in your wallets - we cover ALL gas fees!</b>",
    open_source: "💻 <b>We're open source!</b> Check out our code at <a href=\"https://github.com/TheUnknownIndividual/solbeck\">GitHub</a>",
    choose_action: "🚀 Choose your action:",
    continue_cleanup: "🗯 Continue with Full Cleanup",
    burn_leftover: "🔥 Burn Leftover Tokens",
    referral_welcome_msg: "🎉🎁 <b>WELCOME {} MEMBER!</b> 🎁🎉\n\n⭐ <b>EXCLUSIVE BENEFIT UNLOCKED:</b> ⭐\n🆓 <b>FREE WALLET CLEANING FOR YOUR FIRST {} WALLETS!</b>\n💯 <b>ZERO SERVICE FEES - YOU KEEP 100% OF RECLAIMED SOL!</b>\n\n🔥 This means you can clean up to {} different wallets without paying any service fees at all!",
    referral_benefits: "💎 <b>YOUR EXCLUSIVE {} BENEFITS:</b>\n🆓 <b>FIRST {} WALLETS: COMPLETELY FREE (0% fee)</b>\n💰 ~0.002 SOL reclaimed per closed token account\n💯 You keep 100% of ALL reclaimed SOL for your first {} wallets!\n🔄 After {} wallets: standard 10% service fee applies\n\n📊 <b>Free Wallet Counter: {}/{} remaining</b>",
    burn_explanation: "🔥 <b>Burn Leftover Tokens</b>\n\n💡 <b>What this does:</b>\n• Scans your wallets for token accounts with balances\n• Identifies inactive tokens (no transactions for 5+ days)\n• Allows you to permanently burn unwanted tokens\n• Closes the accounts to reclaim SOL rent\n\n💰 <b>Rewards & Fees:</b>\n• ~0.002039 SOL per token account closed\n• We take a 10% service fee from reclaimed SOL\n• You keep 90% of all reclaimed SOL\n• 🎆 We pay ALL transaction fees for you!\n\n⚠️ <b>Important:</b>\n• Token burning is PERMANENT and irreversible\n• Only burn tokens you don't need\n• No SOL needed in your wallets for gas fees\n\n🔑 Ready to connect your wallet?",
    start_burning: "🔥 Start Token Burning",
    back_to_menu: "⬅️ Back to Main Menu",
    success_header: "✅ <b>Success!</b>",
    burned_tokens_header: "🔥 <b>Burned {} tokens:</b>",
    closed_accounts_msg: "🗂️ Closed {} empty accounts",
    total_reclaimed: "💰 <b>Total Reclaimed:</b> {} SOL",
    service_fee: "💲 <b>Service Fee (10%):</b> {} SOL",
    you_receive: "✅ <b>You Receive:</b> {} SOL",
    cleaned_wallets: "👛 Cleaned up {} wallet(s)!",
    breakdown_header: "📊 <b>Breakdown:</b>",
    token_accounts_burned: "🔥 Token accounts burned: {}",
    empty_accounts_closed: "🧹 Empty accounts closed: {}",
    success_completion: "🎉 All accounts have been cleaned and your net SOL has been refunded to your destination address!",
    no_fees_charged: "💳 <b>No transaction fees charged to you - we covered all gas costs!</b>",
    referral_remaining: "🎁 <b>{} member:</b> {} feeless wallet{} remaining!",
    referral_quota_used: "🎁 <b>{} member:</b> Feeless quota used. Standard 10% fee applies to future operations.",
    view_on_solscan: "View on Solscan",
    language_selector: "🌐 Language / Язык",
    stats_error: "❌ Error retrieving statistics. Please try again later.",
    invalid_key_start: "❌ Invalid Base58 key detected—please /start again.",
    wallets_optimized: "ℹ️ No token accounts found to close. Your wallets are already optimized!",
    invalid_address_start: "❌ Invalid Solana address—please /start again.",
    invalid_key_burn: "❌ Invalid Base58 key detected—please /burntokens again.",
    no_tokens_burn: "ℹ️ No tokens found to burn. All your token accounts are already empty!",
    invalid_address_burn: "❌ Invalid Solana address—please /burntokens again.",
    provide_sol_address: "📥 Please reply with the SOL address to receive all funds:",
    no_active_tokens: "ℹ️ No active tokens to process. Operation cancelled.",
    processing_request: "⏳ Processing your request...",
    no_actions_taken: "ℹ️ No actions were taken. Your wallets are already optimized!",
    processing_burn: "🔥 Processing token burning and cleanup...",
    no_tokens_selected: "❌ No tokens selected for burning.",
    language_set_english: "🇺🇸 <b>Language set to English!</b>\n\nRestarting bot...",
    language_set_russian: "🇷🇺 <b>Язык установлен на русский!</b>\n\nПерезапуск бота...",
    english_button: "🇺🇸 English",
    back_button: "⬅️ Back / Назад",
    full_cleanup_button: "🗯 Continue with Full Cleanup",
    burn_leftover_button: "🔥 Burn Leftover Tokens",
    start_burning_button: "🔥 Start Token Burning",
    back_main_menu_button: "⬅️ Back to Main Menu",
    yes_burn_inactive: "✅ Yes, burn all inactive",
    choose_manually: "🔍 Let me choose manually",
    skip_inactive: "❌ Skip inactive tokens",
    previous_button: "⬅️ Previous",
    next_button: "➡️ Next",
    back_consolidation: "⬅️ Back to Consolidation",
    yes_button: "✅ Yes",
    no_button: "❌ No",
    burn_x_tokens_close_y: "🔥 Burn {} tokens & close {} empty accounts",
    burn_x_tokens: "🔥 Burn {} tokens",
    skip_burn_close_y: "✅ Skip burning & close {} empty accounts",
    skip_burning: "✅ Skip burning",
    tokens_with_balances: "🪙 <b>Found {} token accounts with balances!</b>\n\n⚠️ To close these accounts, we need to burn the tokens first.\n📋 We also found {} empty accounts that can be closed immediately.\n\n💡 Choose your consolidation preference first:",
    empty_accounts_found: "✅ <b>Found {} empty token accounts!</b>\n\n🎉 All can be closed immediately to reclaim SOL rent.\n\n💡 Choose your consolidation preference:",
    inactive_tokens_found: "⏰ <b>Found {} inactive token accounts!</b>\n\n📊 <b>Summary:</b>\n• Inactive tokens (5+ days): {}\n• Active tokens: {}\n• Empty accounts: {}\n\n💡 <b>Inactive tokens are often forgotten tokens that can be safely burned.</b>\n\n❓ Would you like to burn all inactive tokens automatically?",
    active_tokens_only: "🔥 <b>Found {} active tokens!</b>\n\nNo inactive tokens detected. All tokens have recent activity.\n\n💡 Choose your consolidation preference for reclaimed SOL:",
    burn_command_text: "🔥 <b>Burn Leftover Tokens</b>\n\n💡 <b>What this does:</b>\n• Scans your wallets for token accounts with balances\n• Identifies inactive tokens (no transactions for 5+ days)\n• Allows you to permanently burn unwanted tokens\n• Closes the accounts to reclaim SOL rent\n\n💰 <b>Rewards & Fees:</b>\n• ~0.002039 SOL per token account closed\n• We take a 10% service fee from reclaimed SOL\n• You keep 90% of all reclaimed SOL\n• 🎆 We pay ALL transaction fees for you!\n\n⚠️ <b>Important:</b>\n• Token burning is PERMANENT and irreversible\n• Only burn tokens you don't need\n• No SOL needed in your wallets for gas fees\n\n🔑 Ready to connect your wallet?",
    burn_selected_processing: "We've burnt the unused token(s) you selected successfully, we've closed a total of {} accounts and burnt from the following tokens:",
    burn_total_breakdown: "The total comes out to:",
    processing_active_tokens: "🔥 <b>Processing {} active tokens...</b>\n\n💡 These tokens have recent activity and may be valuable. Please review carefully before burning.\n\n⚠️ Token burning is PERMANENT and irreversible!",
    select_language: "🌐 <b>Select your language / Выберите язык:</b>",
    russian_button: "🇷🇺 Русский",
    back_to_start_msg: "👋 <b>Welcome to SOL Reclaimer, {}!</b>\n\n💰 <b>What we offer:</b>\n• Close empty token accounts & reclaim SOL rent\n• Detect inactive token accounts (5+ days)\n• Optimize wallet storage automatically\n• Safe & secure in-memory processing\n\n🎯 <b>Potential rewards:</b>\n• ~0.002 SOL per closed account\n• Clean, optimized wallet\n• Reduced transaction costs\n\n🚀 Choose your action:",
    connect_wallet_burn: "🔑 <b>Connect your wallet for token burning</b>\n\nSend your private key(s), separated by newline, comma, or space.\n\n🔒 <b>Security:</b> Keys are encrypted in-memory and never stored permanently.\n🎆 <b>Gas Fees:</b> No SOL needed in your wallets - we pay ALL transaction fees!",
    tokens_with_balances_simple: "🪙 <b>Found {} token accounts with balances!</b>\n\n⚠️ To close these accounts, we need to burn the tokens first.\n📋 We also found {} empty accounts that can be closed immediately.\n\n💡 Choose your consolidation preference first:",
    empty_accounts_simple: "✅ <b>Found {} empty token accounts!</b>\n\n🎉 All can be closed immediately to reclaim SOL rent.\n\n💡 Choose your consolidation preference:",
    inactive_tokens_simple: "⏰ <b>Found {} inactive token accounts!</b>\n\n📊 <b>Summary:</b>\n• Inactive tokens (5+ days): {}\n• Active tokens: {}\n• Empty accounts: {}\n\n💡 <b>Inactive tokens are often forgotten tokens that can be safely burned.</b>\n\n❓ Would you like to burn all inactive tokens automatically?",
    active_tokens_simple: "🔥 <b>Found {} active tokens!</b>\n\nNo inactive tokens detected. All tokens have recent activity.\n\n💡 Choose your consolidation preference for reclaimed SOL:",
    consolidation_question: "🤔 <b>Consolidate reclaimed SOL?</b>\n\nSend ALL reclaimed SOL into one address, or return each to its original wallet.",
    consolidation_question_burn: "💡 Choose your consolidation preference for reclaimed SOL:",
    selected_inactive_burn: "✅ <b>All {} inactive tokens selected for burning!</b>\n\n💡 Choose your consolidation preference for reclaimed SOL:",
    manual_token_selection: "🔥 <b>Manual Token Selection</b>\n\n💡 Choose your consolidation preference first:",
    active_tokens_only_burn: "🔥 <b>Processing {} active tokens only</b>\n\n💡 Choose your consolidation preference:",
    select_tokens_burn: "🔥 <b>Select tokens to burn</b>\n\n📄 Page {}/{}\n🔢 Showing {}-{} of {} tokens\n✅ Selected: {}\n\n📊 <b>Summary:</b>\n• Tokens with balances: {}\n• Empty accounts to close: {}\n\n⚠️ <b>Warning:</b> Burning tokens is permanent!\n💡 Empty accounts will be closed automatically after burning.",
    burn_token_selection: "🔥 <b>Select tokens to burn</b>\n\n📄 Page {}/{}\n🔢 Showing {}-{} of {} tokens\n✅ Selected: {}\n\n⏰ Inactive (5+ days): {}\n🟢 Active: {}\n\n⚠️ <b>Warning:</b> Burning tokens is permanent and irreversible!\n💰 Token accounts will be closed and SOL rent will be reclaimed.",
    connect_wallet_simple: "🔑 <b>Connect your wallet for burning</b>\n\nSend your private key(s), separated by newline, comma, or space.\n\n<b>NOTE:</b> Keys are encrypted in-memory and never stored permanently.",
    error_token_balance: "❌ Some token accounts still have balances. Please select them for burning first.",
    error_insufficient_sol: "❌ Insufficient SOL for transaction fees.",
    error_token_cannot_close: "❌ Token account has a balance and cannot be closed. Select it for burning first.",
    error_generic: "An error occurred while processing your request.",
    error_burn_generic: "❌ An error occurred while burning tokens.",
    error_burn_insufficient: "❌ Insufficient SOL for transaction fees.",
    error_burn_frozen: "❌ Some tokens are frozen and cannot be burned.",
    error_burn_ownership: "❌ Invalid account ownership. Please verify your private keys.",
    processing_request: "⏳ Processing your request...",
    processing_burn_cleanup: "🔥 Processing token burning and cleanup...",
    no_active_tokens: "ℹ️ No active tokens to process. Operation cancelled.",
    no_actions_taken: "ℹ️ No actions were taken. Your wallets are already optimized!",
    no_tokens_selected: "❌ No tokens selected for burning.",
    consolidate_sol: "✅ Consolidate all SOL",
    keep_sol_wallets: "❌ Keep SOL in wallets",
    previous: "⬅️ Previous",
    next: "➡️ Next",
    burn_tokens_close_accounts: "🔥 Burn {} tokens & close {} empty accounts",
    burn_tokens_only: "🔥 Burn {} tokens",
    skip_burning_close_accounts: "✅ Skip burning & close {} empty accounts",
    skip_burning: "✅ Skip burning",
    back_to_consolidation: "⬅️ Back to Consolidation"
  },
  ru: {
    welcome: "🤖 <b>Добро пожаловать в SolBeck!</b>\n\n🔥 <b>Мульти-кошелёк сжигатель токенов и возвратчик SOL</b>\n\n✨ <b>Что я могу делать:</b>\n• Сжигать нежелательные токены из нескольких кошельков\n• Закрывать пустые токен-аккаунты для возврата SOL аренды\n• Консолидировать SOL из нескольких кошельков\n• Обрабатывать большие партии (до 100 кошельков)\n\n🚀 <b>Готовы оптимизировать свои кошельки?</b>",
    referral_welcome: "🎉 <b>Добро пожаловать в SolBeck!</b>\n\n🌟 <b>Вы ценный член сообщества Magnum!</b>\n\nВ качестве особой благодарности за вашу поддержку, вы получите <b>бесплатное обслуживание</b> для всех операций! 🎁\n\n✨ <b>Что я могу делать:</b>\n• Сжигать нежелательные токены из нескольких кошельков\n• Закрывать пустые токен-аккаунты для возврата SOL аренды\n• Консолидировать SOL из нескольких кошельков\n• Обрабатывать большие партии (до 100 кошельков)\n\n🚀 <b>Готовы оптимизировать свои кошельки?</b>",
    get_started: "🚀 Начать",
    burn_tokens: "🔥 Только сжечь токены",
    provide_keys: "🔑 <b>Предоставьте ваши приватные ключи</b>\n\n📝 Отправьте мне ваши приватные ключи (по одному на строку или разделённые пробелами/запятыми):\n\n⚠️ <b>Примечания по безопасности:</b>\n• Ключи шифруются и никогда не хранятся постоянно\n• Только вы можете видеть этот разговор\n• Ключи удаляются после обработки\n• Поддерживается до 100 кошельков\n\n💡 <b>Пример формата:</b>\n<code>3X4mF8...\n9Z2nK7...\n6A1sD9...</code>",
    provide_keys_burn: "🔥 <b>Предоставьте ключи для сжигания токенов</b>\n\n📝 Отправьте мне ваши приватные ключи (по одному на строку или разделённые пробелами/запятыми):\n\n⚠️ <b>Примечания по безопасности:</b>\n• Ключи шифруются и никогда не хранятся постоянно\n• Только вы можете видеть этот разговор\n• Ключи удаляются после обработки\n• Поддерживается до 100 кошельков\n\n💡 <b>Пример формата:</b>\n<code>3X4mF8...\n9Z2nK7...\n6A1sD9...</code>",
    invalid_key: "❌ Обнаружен неверный Base58 ключ—пожалуйста, /start снова.",
    invalid_key_burn: "❌ Обнаружен неверный Base58 ключ—пожалуйста, /burntokens снова.",
    scanning: "🔍 Сканирую ваши кошельки на токены...",
    scanning_burn: "🔍 Сканирую ваши кошельки на токены для сжигания...",
    scan_error: "❌ Ошибка сканирования ваших кошельков. Попробуйте снова с /start.",
    scan_error_burn: "❌ Ошибка сканирования ваших кошельков. Попробуйте снова с /burntokens.",
    bad_secret_key: "❌ Обнаружен неверный формат приватного ключа. Убедитесь, что все приватные ключи являются действительными 64-символьными Base58 строками. Используйте /start для повтора.",
    bad_secret_key_burn: "❌ Обнаружен неверный формат приватного ключа. Убедитесь, что все приватные ключи являются действительными 64-символьными Base58 строками. Используйте /burntokens для повтора.",
    invalid_key_error: "❌ Один или несколько приватных ключей неверны. Проверьте ваши ключи и попробуйте снова с /start.",
    invalid_key_error_burn: "❌ Один или несколько приватных ключей неверны. Проверьте ваши ключи и попробуйте снова с /burntokens.",
    consolidate_yes: "✅ Консолидировать весь SOL",
    consolidate_no: "❌ Оставить SOL в кошельках",
    provide_address: "📮 <b>Предоставьте адрес выплаты</b>\n\nПожалуйста, отправьте мне Solana адрес, куда вы хотите получить ваш консолидированный SOL:",
    invalid_address: "❌ Неверный Solana адрес. Пожалуйста, предоставьте действительный адрес.",
    processing: "⚙️ Обрабатываю ваш запрос...\n\n⏳ Это может занять несколько минут для больших партий.",
    no_actions: "ℹ️ Никаких действий не было предпринято. Ваши кошельки уже оптимизированы!",
    success: "✅ <b>Успех!</b>",
    burned_tokens: "🔥 <b>Сожжено {} токенов:</b>",
    closed_accounts: "🧹 <b>Закрыто {} пустых аккаунтов</b>",
    consolidated_sol: "💰 <b>Консолидировано {} SOL</b> → {}",
    reclaimed_sol: "🪙 <b>Возвращено {} SOL</b> из аренды",
    fees_collected: "💸 <b>Сервисная комиссия:</b> {} SOL",
    net_received: "💵 <b>Чистая прибыль:</b> {} SOL",
    usd_value: "💵 <b>USD стоимость:</b> ${}",
    transaction_link: "🔗 <b>Транзакция:</b> <a href=\"https://solscan.io/tx/{}\">Посмотреть на Solscan</a>",
    stats_title: "📊 <b>Ваша статистика SolBeck</b>",
    stats_wallets: "🔑 <b>Всего кошельков обработано:</b> {}",
    stats_tokens: "🔥 <b>Всего токенов сожжено:</b> {}",
    stats_accounts: "🧹 <b>Всего аккаунтов закрыто:</b> {}",
    stats_sol: "💰 <b>Всего SOL возвращено:</b> {} SOL",
    stats_none: "📊 <b>Пока нет статистики</b>\n\nИспользуйте /start чтобы начать оптимизацию ваших кошельков!",
    language_detect: "🌐 Язык установлен на русский",
    language_switch: "🔄 Язык",
    welcome_to: "👋 <b>Добро пожаловать в solbeck, {}!</b>",
    what_we_offer: "💰 <b>Что мы предлагаем:</b>\n• Закрытие пустых токен-аккаунтов и возврат SOL аренды\n• Обнаружение неактивных токен-аккаунтов (5+ дней)\n• Автоматическая оптимизация хранения кошельков\n• Безопасная обработка в памяти",
    rewards_fees: "🎯 <b>Награды и комиссии:</b>\n• ~0.002 SOL за закрытый аккаунт\n• Мы берём 10% сервисную комиссию с возвращённых SOL\n• Вы сохраняете 90% всех возвращённых SOL",
    no_sol_needed: "🎆 <b>SOL не нужен в ваших кошельках - мы покрываем ВСЕ газовые комиссии!</b>",
    open_source: "💻 <b>Мы с открытым исходным кодом!</b> Посмотрите наш код на <a href=\"https://github.com/TheUnknownIndividual/solbeck\">GitHub</a>",
    choose_action: "🚀 Выберите ваше действие:",
    continue_cleanup: "🗯 Продолжить с полной очисткой",
    burn_leftover: "🔥 Сжечь оставшиеся токены",
    referral_welcome_msg: "🎉🎁 <b>ДОБРО ПОЖАЛОВАТЬ УЧАСТНИК {}!</b> 🎁🎉\n\n⭐ <b>ЭКСКЛЮЗИВНАЯ ВЫГОДА РАЗБЛОКИРОВАНА:</b> ⭐\n🆓 <b>БЕСПЛАТНАЯ ОЧИСТКА КОШЕЛЬКА ДЛЯ ВАШИХ ПЕРВЫХ {} КОШЕЛЬКОВ!</b>\n💯 <b>НУЛЕВЫЕ СЕРВИСНЫЕ КОМИССИИ - ВЫ СОХРАНЯЕТЕ 100% ВОЗВРАЩЁННЫХ SOL!</b>\n\n🔥 Это означает, что вы можете очистить до {} различных кошельков без уплаты каких-либо сервисных комиссий вообще!",
    referral_benefits: "💎 <b>ВАШИ ЭКСКЛЮЗИВНЫЕ {} ВЫГОДЫ:</b>\n🆓 <b>ПЕРВЫЕ {} КОШЕЛЬКОВ: ПОЛНОСТЬЮ БЕСПЛАТНО (0% комиссия)</b>\n💰 ~0.002 SOL возвращено за закрытый токен аккаунт\n💯 Вы сохраняете 100% ВСЕХ возвращённых SOL для ваших первых {} кошельков!\n🔄 После {} кошельков: применяется стандартная 10% сервисная комиссия\n\n📊 <b>Счётчик бесплатных кошельков: {}/{} осталось</b>",
    burn_explanation: "🔥 <b>Сжечь оставшиеся токены</b>\n\n💡 <b>Что это делает:</b>\n• Сканирует ваши кошельки на токен-аккаунты с балансами\n• Определяет неактивные токены (без транзакций 5+ дней)\n• Позволяет вам навсегда сжечь ненужные токены\n• Закрывает аккаунты для возврата SOL аренды\n\n💰 <b>Награды и комиссии:</b>\n• ~0.002039 SOL за закрытый токен аккаунт\n• Мы берём 10% сервисную комиссию с возвращённых SOL\n• Вы сохраняете 90% всех возвращённых SOL\n• 🎆 Мы платим ВСЕ транзакционные комиссии за вас!\n\n⚠️ <b>Важно:</b>\n• Сжигание токенов ПОСТОЯННО и необратимо\n• Сжигайте только токены, которые вам не нужны\n• SOL не нужен в ваших кошельках для газовых комиссий\n\n🔑 Готовы подключить ваш кошелёк?",
    start_burning: "🔥 Начать сжигание токенов",
    back_to_menu: "⬅️ Назад в главное меню",
    success_header: "✅ <b>Успех!</b>",
    burned_tokens_header: "🔥 <b>Сожжено {} токенов:</b>",
    closed_accounts_msg: "🗂️ Закрыто {} пустых аккаунтов",
    total_reclaimed: "💰 <b>Всего возвращено:</b> {} SOL",
    service_fee: "💲 <b>Сервисная комиссия (10%):</b> {} SOL",
    you_receive: "✅ <b>Вы получаете:</b> {} SOL",
    cleaned_wallets: "👛 Очищено {} кошелек(ов)!",
    breakdown_header: "📊 <b>Детализация:</b>",
    token_accounts_burned: "🔥 Токен аккаунтов сожжено: {}",
    empty_accounts_closed: "🧹 Пустых аккаунтов закрыто: {}",
    success_completion: "🎉 Все аккаунты были очищены и ваш чистый SOL был возвращён на адрес назначения!",
    no_fees_charged: "💳 <b>Никаких транзакционных комиссий с вас не взимается - мы покрыли все газовые расходы!</b>",
    referral_remaining: "🎁 <b>Участник {}:</b> {} бесплатны{} кошелек{} осталось!",
    referral_quota_used: "🎁 <b>Участник {}:</b> Бесплатная квота использована. Стандартная 10% комиссия применяется к будущим операциям.",
    view_on_solscan: "Посмотреть на Solscan",
    language_selector: "🌐 Language / Язык",
    stats_error: "❌ Ошибка получения статистики. Попробуйте позже.",
    invalid_key_start: "❌ Обнаружен неверный Base58 ключ—пожалуйста, /start снова.",
    wallets_optimized: "ℹ️ Токен аккаунтов для закрытия не найдено. Ваши кошельки уже оптимизированы!",
    invalid_address_start: "❌ Неверный Solana адрес—пожалуйста, /start снова.",
    invalid_key_burn: "❌ Обнаружен неверный Base58 ключ—пожалуйста, /burntokens снова.",
    no_tokens_burn: "ℹ️ Токенов для сжигания не найдено. Все ваши токен аккаунты уже пусты!",
    invalid_address_burn: "❌ Неверный Solana адрес—пожалуйста, /burntokens снова.",
    provide_sol_address: "📥 Пожалуйста, ответьте SOL адресом для получения всех средств:",
    no_active_tokens: "ℹ️ Активных токенов для обработки нет. Операция отменена.",
    processing_request: "⏳ Обрабатываю ваш запрос...",
    no_actions_taken: "ℹ️ Никаких действий не было предпринято. Ваши кошельки уже оптимизированы!",
    processing_burn: "🔥 Обрабатываю сжигание токенов и очистку...",
    no_tokens_selected: "❌ Токены для сжигания не выбраны.",
    language_set_english: "🇺🇸 <b>Language set to English!</b>\n\nRestarting bot...",
    language_set_russian: "🇷🇺 <b>Язык установлен на русский!</b>\n\nПерезапуск бота...",
    english_button: "🇺🇸 English",
    back_button: "⬅️ Назад",
    full_cleanup_button: "🗯 Продолжить с полной очисткой",
    burn_leftover_button: "🔥 Сжечь оставшиеся токены",
    start_burning_button: "🔥 Начать сжигание токенов",
    back_main_menu_button: "⬅️ Назад в главное меню",
    yes_burn_inactive: "✅ Да, сжечь все неактивные",
    choose_manually: "🔍 Позвольте мне выбрать вручную",
    skip_inactive: "❌ Пропустить неактивные токены",
    previous_button: "⬅️ Предыдущий",
    next_button: "➡️ Следующий",
    back_consolidation: "⬅️ Назад к консолидации",
    yes_button: "✅ Да",
    no_button: "❌ Нет",
    burn_x_tokens_close_y: "🔥 Сжечь {} токенов и закрыть {} пустых аккаунтов",
    burn_x_tokens: "🔥 Сжечь {} токенов",
    skip_burn_close_y: "✅ Пропустить сжигание и закрыть {} пустых аккаунтов",
    skip_burning: "✅ Пропустить сжигание",
    tokens_with_balances: "🪙 <b>Найдено {} токен аккаунтов с балансами!</b>\n\n⚠️ Чтобы закрыть эти аккаунты, нам нужно сначала сжечь токены.\n📋 Мы также нашли {} пустых аккаунтов, которые можно закрыть немедленно.\n\n💡 Сначала выберите ваши предпочтения консолидации:",
    empty_accounts_found: "✅ <b>Найдено {} пустых токен аккаунтов!</b>\n\n🎉 Все можно закрыть немедленно для возврата SOL аренды.\n\n💡 Выберите ваши предпочтения консолидации:",
    inactive_tokens_found: "⏰ <b>Найдено {} неактивных токен аккаунтов!</b>\n\n📊 <b>Сводка:</b>\n• Неактивные токены (5+ дней): {}\n• Активные токены: {}\n• Пустые аккаунты: {}\n\n💡 <b>Неактивные токены часто являются забытыми токенами, которые можно безопасно сжечь.</b>\n\n❓ Хотите ли вы автоматически сжечь все неактивные токены?",
    active_tokens_only: "🔥 <b>Найдено {} активных токенов!</b>\n\nНеактивных токенов не обнаружено. Все токены имеют недавнюю активность.\n\n💡 Выберите ваши предпочтения консолидации для возвращённых SOL:",
    burn_command_text: "🔥 <b>Сжечь оставшиеся токены</b>\n\n💡 <b>Что это делает:</b>\n• Сканирует ваши кошельки на токен аккаунты с балансами\n• Определяет неактивные токены (без транзакций 5+ дней)\n• Позволяет вам навсегда сжечь ненужные токены\n• Закрывает аккаунты для возврата SOL аренды\n\n💰 <b>Награды и комиссии:</b>\n• ~0.002039 SOL за закрытый токен аккаунт\n• Мы берём 10% сервисную комиссию с возвращённых SOL\n• Вы сохраняете 90% всех возвращённых SOL\n• 🎆 Мы платим ВСЕ транзакционные комиссии за вас!\n\n⚠️ <b>Важно:</b>\n• Сжигание токенов ПОСТОЯННО и необратимо\n• Сжигайте только токены, которые вам не нужны\n• SOL не нужен в ваших кошельках для газовых комиссий\n\n🔑 Готовы подключить ваш кошелёк?",
    burn_selected_processing: "Мы успешно сожгли выбранные вами неиспользуемые токены, мы закрыли в общей сложности {} аккаунтов и сожгли следующие токены:",
    burn_total_breakdown: "Общая сумма составляет:",
    processing_active_tokens: "🔥 <b>Обрабатываю {} активных токенов...</b>\n\n💡 Эти токены имеют недавнюю активность и могут быть ценными. Пожалуйста, внимательно просмотрите перед сжиганием.\n\n⚠️ Сжигание токенов ПОСТОЯННО и необратимо!",
    select_language: "🌐 <b>Выберите язык / Select your language:</b>",
    russian_button: "🇷🇺 Русский",
    back_to_start_msg: "👋 <b>Добро пожаловать в SOL Reclaimer, {}!</b>\n\n💰 <b>Что мы предлагаем:</b>\n• Закрытие пустых токен-аккаунтов и возврат SOL аренды\n• Обнаружение неактивных токен-аккаунтов (5+ дней)\n• Автоматическая оптимизация хранения кошельков\n• Безопасная обработка в памяти\n\n🎯 <b>Потенциальные награды:</b>\n• ~0.002 SOL за закрытый аккаунт\n• Чистый, оптимизированный кошелёк\n• Снижение затрат на транзакции\n\n🚀 Выберите ваше действие:",
    connect_wallet_burn: "🔑 <b>Подключите ваш кошелёк для сжигания токенов</b>\n\nОтправьте ваши приватные ключи, разделённые новой строкой, запятой или пробелом.\n\n🔒 <b>Безопасность:</b> Ключи шифруются в памяти и никогда не хранятся постоянно.\n🎆 <b>Газовые сборы:</b> SOL не нужен в ваших кошельках - мы платим ВСЕ транзакционные сборы!",
    tokens_with_balances_simple: "🪙 <b>Найдено {} токен аккаунтов с балансами!</b>\n\n⚠️ Чтобы закрыть эти аккаунты, нам нужно сначала сжечь токены.\n📋 Мы также нашли {} пустых аккаунтов, которые можно закрыть немедленно.\n\n💡 Сначала выберите ваши предпочтения консолидации:",
    empty_accounts_simple: "✅ <b>Найдено {} пустых токен аккаунтов!</b>\n\n🎉 Все можно закрыть немедленно для возврата SOL аренды.\n\n💡 Выберите ваши предпочтения консолидации:",
    inactive_tokens_simple: "⏰ <b>Найдено {} неактивных токен аккаунтов!</b>\n\n📊 <b>Сводка:</b>\n• Неактивные токены (5+ дней): {}\n• Активные токены: {}\n• Пустые аккаунты: {}\n\n💡 <b>Неактивные токены часто являются забытыми токенами, которые можно безопасно сжечь.</b>\n\n❓ Хотите ли вы автоматически сжечь все неактивные токены?",
    active_tokens_simple: "🔥 <b>Найдено {} активных токенов!</b>\n\nНеактивных токенов не обнаружено. Все токены имеют недавнюю активность.\n\n💡 Выберите ваши предпочтения консолидации для возвращённых SOL:",
    consolidation_question: "🤔 <b>Консолидировать возвращённые SOL?</b>\n\nОтправить ВСЕ возвращённые SOL на один адрес, или вернуть каждый в свой оригинальный кошелёк.",
    consolidation_question_burn: "💡 Выберите ваши предпочтения консолидации для возвращённых SOL:",
    selected_inactive_burn: "✅ <b>Все {} неактивных токенов выбраны для сжигания!</b>\n\n💡 Выберите ваши предпочтения консолидации для возвращённых SOL:",
    manual_token_selection: "🔥 <b>Ручной выбор токенов</b>\n\n💡 Сначала выберите ваши предпочтения консолидации:",
    active_tokens_only_burn: "🔥 <b>Обрабатываю только {} активных токенов</b>\n\n💡 Выберите ваши предпочтения консолидации:",
    select_tokens_burn: "🔥 <b>Выберите токены для сжигания</b>\n\n📄 Страница {}/{}\n🔢 Показано {}-{} из {} токенов\n✅ Выбрано: {}\n\n📊 <b>Сводка:</b>\n• Токены с балансами: {}\n• Пустые аккаунты для закрытия: {}\n\n⚠️ <b>Предупреждение:</b> Сжигание токенов постоянно!\n💡 Пустые аккаунты будут закрыты автоматически после сжигания.",
    burn_token_selection: "🔥 <b>Выберите токены для сжигания</b>\n\n📄 Страница {}/{}\n🔢 Показано {}-{} из {} токенов\n✅ Выбрано: {}\n\n⏰ Неактивные (5+ дней): {}\n🟢 Активные: {}\n\n⚠️ <b>Предупреждение:</b> Сжигание токенов постоянно и необратимо!\n💰 Токен аккаунты будут закрыты и SOL аренда будет возвращена.",
    connect_wallet_simple: "🔑 <b>Подключите ваш кошелёк для сжигания</b>\n\nОтправьте ваши приватные ключи, разделённые новой строкой, запятой или пробелом.\n\n<b>ПРИМЕЧАНИЕ:</b> Ключи шифруются в памяти и никогда не хранятся постоянно.",
    error_token_balance: "❌ Некоторые токен аккаунты всё ещё имеют балансы. Пожалуйста, сначала выберите их для сжигания.",
    error_insufficient_sol: "❌ Недостаточно SOL для транзакционных сборов.",
    error_token_cannot_close: "❌ Токен аккаунт имеет баланс и не может быть закрыт. Сначала выберите его для сжигания.",
    error_generic: "Произошла ошибка при обработке вашего запроса.",
    error_burn_generic: "❌ Произошла ошибка при сжигании токенов.",
    error_burn_insufficient: "❌ Недостаточно SOL для транзакционных сборов.",
    error_burn_frozen: "❌ Некоторые токены заморожены и не могут быть сожжены.",
    error_burn_ownership: "❌ Неверная собственность аккаунта. Пожалуйста, проверьте ваши приватные ключи.",
    processing_request: "⏳ Обрабатываю ваш запрос...",
    processing_burn_cleanup: "🔥 Обрабатываю сжигание токенов и очистку...",
    no_active_tokens: "ℹ️ Нет активных токенов для обработки. Операция отменена.",
    no_actions_taken: "ℹ️ Никаких действий не предпринято. Ваши кошельки уже оптимизированы!",
    no_tokens_selected: "❌ Не выбрано токенов для сжигания.",
    consolidate_sol: "✅ Консолидировать все SOL",
    keep_sol_wallets: "❌ Оставить SOL в кошельках",
    previous: "⬅️ Назад",
    next: "➡️ Далее",
    burn_tokens_close_accounts: "🔥 Сжечь {} токенов и закрыть {} пустых аккаунтов",
    burn_tokens_only: "🔥 Сжечь {} токенов",
    skip_burning_close_accounts: "✅ Пропустить сжигание и закрыть {} пустых аккаунтов",
    skip_burning: "✅ Пропустить сжигание",
    back_to_consolidation: "⬅️ Назад к консолидации"
  }
};

// User language preferences storage
const userLanguages = new Map();

// Language detection and management functions
function detectUserLanguage(ctx) {
  const userId = ctx.from.id;
  
  // Check if user has previously set language
  if (userLanguages.has(userId)) {
    return userLanguages.get(userId);
  }
  
  // Detect from Telegram language code
  const telegramLang = ctx.from.language_code;
  
  if (telegramLang) {
    // Map common language codes to supported languages
    if (telegramLang.startsWith('ru')) {
      userLanguages.set(userId, 'ru');
      return 'ru';
    }
    // Add more language mappings as needed
    else if (telegramLang.startsWith('en')) {
      userLanguages.set(userId, 'en');
      return 'en';
    }
  }
  
  // Default to English
  userLanguages.set(userId, 'en');
  return 'en';
}

function setUserLanguage(userId, language) {
  if (TRANSLATIONS[language]) {
    userLanguages.set(userId, language);
    return true;
  }
  return false;
}

function t(ctx, key, ...args) {
  const lang = detectUserLanguage(ctx);
  const translation = TRANSLATIONS[lang]?.[key] || TRANSLATIONS.en[key] || key;
  
  // Simple placeholder replacement for {} markers
  let result = translation;
  args.forEach((arg, index) => {
    result = result.replace('{}', arg);
  });
  
  return result;
}

// ===== END MULTILINGUAL SUPPORT SYSTEM =====

// Environment variables validation
const BOT_TOKEN = process.env.BOT_TOKEN;
const FEE_PAYER_SECRET = process.env.FEE_PAYER_SECRET;
const RPC_URL = process.env.RPC_URL;
const FEE_COLLECTOR_ADDRESS = process.env.FEE_COLLECTOR;

// Fixed fee settings (public and transparent)
const FEE_RATE = 0.10; // 10% service fee - fixed and transparent
const MINIMUM_RENT = 890880; // Minimum lamports for rent exemption (~0.0009 SOL)

if (!BOT_TOKEN || !FEE_PAYER_SECRET || !RPC_URL || !FEE_COLLECTOR_ADDRESS) {
  console.error('❌ Required environment variables are missing!');
  console.error('Please check: BOT_TOKEN, FEE_PAYER_SECRET, RPC_URL, FEE_COLLECTOR');
  process.exit(1);
}

const STATS_DIR = path.resolve('./stats');
await fs.mkdir(STATS_DIR, { recursive: true });

const FEE_PAYER = Keypair.fromSecretKey(bs58.decode(FEE_PAYER_SECRET));
const FEE_COLLECTOR = new PublicKey(FEE_COLLECTOR_ADDRESS);

console.log('🔑 Fee payer address:', FEE_PAYER.publicKey.toString());
console.log('💰 Fee collector address:', FEE_COLLECTOR.toString());
console.log('📊 Fee rate:', (FEE_RATE * 100) + '%');
console.log('🌐 RPC URL:', RPC_URL);

// per-user in-memory state
const userState = new Map();

// Referral tracking
const referralUsers = new Map(); // userId -> { referralCode, walletCount, isFeeless }
const REFERRAL_CODES = {
  'magnumcommunity': {
    name: 'Magnum Community',
    freeWallets: 10,
    description: 'Magnum Community members get feeless service for first 10 wallets!'
  }
  // Add more referral codes here as needed
};

// Check if user is eligible for feeless service
function isUserFeeless(userId, walletCount) {
  const referralInfo = referralUsers.get(userId);
  if (!referralInfo) return false;
  
  const referralConfig = REFERRAL_CODES[referralInfo.referralCode];
  if (!referralConfig) return false;
  
  // Check if user is still within their free wallet limit
  return referralInfo.walletCount + walletCount <= referralConfig.freeWallets;
}

// Update user wallet count for referral tracking
function updateReferralWalletCount(userId, walletCount) {
  const referralInfo = referralUsers.get(userId);
  if (referralInfo) {
    referralInfo.walletCount += walletCount;
    referralUsers.set(userId, referralInfo);
  }
}

// Calculate fee amounts and create fee collection instructions
function calculateFeeAndCreateInstructions(totalReclaimedLamports, destinationPubkey, userId = null, walletCount = 0) {
  // Check if user is eligible for feeless service
  const isFeeless = userId && isUserFeeless(userId, walletCount);
  
  const feeLamports = isFeeless ? 0 : Math.floor(totalReclaimedLamports * FEE_RATE);
  const userLamports = totalReclaimedLamports - feeLamports;
  
  const instructions = [];
  
  // Only create fee transfer if fee amount is meaningful (> 1000 lamports) and not feeless
  if (feeLamports > 1000 && !isFeeless) {
    instructions.push(
      SystemProgram.transfer({
        fromPubkey: destinationPubkey,
        toPubkey: FEE_COLLECTOR,
        lamports: feeLamports,
      })
    );
  }
  
  return {
    feeLamports,
    userLamports,
    feeInstructions: instructions,
    feeAmount: feeLamports / 1e9, // Convert to SOL
    userAmount: userLamports / 1e9, // Convert to SOL
    isFeeless
  };
}

// AES‐GCM helpers
function genAESKey() { return crypto.randomBytes(32); }
function encryptAES(key, txt) {
  const iv = crypto.randomBytes(12),
        cipher = crypto.createCipheriv('aes-256-gcm', key, iv),
        ct = Buffer.concat([cipher.update(txt, 'utf8'), cipher.final()]),
        tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}
function decryptAES(key, b64) {
  const buf = Buffer.from(b64, 'base64'),
        iv = buf.slice(0,12), tag = buf.slice(12,28), ct = buf.slice(28),
        decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// Poll for confirmation
async function confirmByPolling(conn, sig) {
  console.log('⏳ Waiting for confirmation:', sig);
  for (let i=0; i<30; i++) {
    const { value } = await conn.getSignatureStatuses([sig]);
    console.log(`🔄 Poll ${i+1}/30 - Status:`, value[0]?.confirmationStatus || 'null');
    if (value[0]?.confirmationStatus === 'confirmed') {
      console.log('✅ Transaction confirmed:', sig);
      return;
    }
    await new Promise(r=>setTimeout(r,1000));
  }
  console.log('⚠️ Transaction not confirmed after 30 polls:', sig);
}

// Get token metadata for display
async function getTokenInfo(conn, mintAddress) {
  try {
    const mint = await getMint(conn, new PublicKey(mintAddress));
    
    // Try to get token metadata from common registries
    let symbol = await getTokenSymbol(conn, mintAddress);
    
    // Better fallback - show "Unknown Token" instead of truncated address
    if (!symbol) {
      symbol = `Unknown (${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)})`;
    }
    
    return {
      symbol: symbol,
      decimals: mint.decimals,
      supply: mint.supply.toString()
    };
  } catch (error) {
    console.error(`Error getting token info for ${mintAddress}:`, error.message);
    return {
      symbol: `Unknown (${mintAddress.slice(0, 4)}...${mintAddress.slice(-4)})`,
      decimals: 9,
      supply: 'Unknown'
    };
  }
}

// Fetch token symbol from metadata or token list
async function getTokenSymbol(conn, mintAddress) {
  try {
    console.log(`🔍 Looking up symbol for token: ${mintAddress}`);
    
    // Try multiple token registry sources
    const sources = [
      // Jupiter strict list (verified tokens)
      {
        name: 'Jupiter Strict',
        url: 'https://token.jup.ag/strict',
        field: 'address'
      },
      // Jupiter all tokens
      {
        name: 'Jupiter All',
        url: 'https://token.jup.ag/all',
        field: 'address'
      }
    ];
    
    for (const source of sources) {
      try {
        console.log(`  📡 Trying ${source.name} API...`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
        
        const response = await fetch(source.url, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (response.ok) {
          const tokenList = await response.json();
          const token = tokenList.find(t => t[source.field] === mintAddress);
          if (token && token.symbol) {
            console.log(`  ✅ Found symbol: ${token.symbol} from ${source.name}`);
            return token.symbol;
          }
        }
      } catch (apiError) {
        console.log(`  ❌ ${source.name} failed:`, apiError.message);
        continue;
      }
    }
    
    // Fallback: check for metadata account
    console.log(`  🔍 Checking on-chain metadata...`);
    try {
      const [metadataPDA] = PublicKey.findProgramAddressSync(
        [
          Buffer.from('metadata'),
          new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
          new PublicKey(mintAddress).toBuffer(),
        ],
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
      );
      
      const accountInfo = await conn.getAccountInfo(metadataPDA);
      if (accountInfo && accountInfo.data) {
        // Try to parse Metaplex metadata
        const data = accountInfo.data;
        
        // Look for the symbol in the metadata structure
        // Metaplex metadata has a specific structure, let's try to parse it properly
        let offset = 1; // Skip first byte (key)
        offset += 32; // Skip update authority
        offset += 32; // Skip mint
        
        // Name length
        const nameLen = data.readUInt32LE(offset);
        offset += 4;
        offset += nameLen; // Skip name
        
        // Symbol length  
        const symbolLen = data.readUInt32LE(offset);
        offset += 4;
        
        if (symbolLen > 0 && symbolLen < 20) { // Reasonable symbol length
          const symbolBytes = data.slice(offset, offset + symbolLen);
          const symbol = symbolBytes.toString('utf8').replace(/\0/g, '').trim();
          if (symbol && symbol.length > 0) {
            console.log(`  ✅ Found on-chain symbol: ${symbol}`);
            return symbol;
          }
        }
      }
    } catch (metadataError) {
      console.log(`  ❌ Metadata parsing failed:`, metadataError.message);
    }
    
    console.log(`  ❌ No symbol found for ${mintAddress}`);
    return null;
  } catch (error) {
    console.error(`❌ Error fetching token symbol for ${mintAddress}:`, error.message);
    return null;
  }
}

// Check if token account is inactive (no transactions in last 5 days)
async function isTokenAccountInactive(conn, tokenAccount) {
  try {
    const signatures = await conn.getSignaturesForAddress(tokenAccount, { limit: 10 });
    
    if (signatures.length === 0) {
      return true; // No transactions at all
    }
    
    const fiveDaysAgo = Date.now() - (5 * 24 * 60 * 60 * 1000); // 5 days in milliseconds
    const lastSignature = signatures[0];
    
    // Get transaction details for the most recent signature
    const tx = await conn.getTransaction(lastSignature.signature, {
      maxSupportedTransactionVersion: 0
    });
    
    if (!tx || !tx.blockTime) {
      return true; // Can't determine, assume inactive
    }
    
    const lastTxTime = tx.blockTime * 1000; // Convert to milliseconds
    return lastTxTime < fiveDaysAgo;
    
  } catch (error) {
    console.error(`Error checking activity for ${tokenAccount.toString()}:`, error.message);
    return false; // If we can't check, assume active to be safe
  }
}

// Scan wallets for token accounts with balances
async function scanTokenAccounts(privateKeyStrings, checkInactivity = false) {
  console.log('\n🔍 Scanning for token accounts with balances...');
  const conn = new Connection(RPC_URL, 'confirmed');
  const owners = privateKeyStrings.map(s => Keypair.fromSecretKey(bs58.decode(s)));
  
  const accountsWithBalances = [];
  const emptyAccounts = [];
  const inactiveAccounts = [];
  
  for (const owner of owners) {
    console.log(`🔎 Checking wallet: ${owner.publicKey.toString()}`);
    try {
      const { value } = await conn.getTokenAccountsByOwner(owner.publicKey, { programId: TOKEN_PROGRAM_ID });
      console.log(`  📋 Found ${value.length} token accounts`);
      
      for (const { pubkey, account } of value) {
        try {
          const tokenAccount = await getAccount(conn, pubkey);
          const balance = Number(tokenAccount.amount);
          
          if (balance > 0) {
            const tokenInfo = await getTokenInfo(conn, tokenAccount.mint.toString());
            const actualBalance = balance / (10 ** tokenInfo.decimals);
            
            console.log(`    🪙 Token account: ${pubkey.toString()}`);
            console.log(`    💰 Balance: ${actualBalance} ${tokenInfo.symbol}`);
            console.log(`    🏷️ Mint: ${tokenAccount.mint.toString()}`);
            
            const tokenData = {
              owner,
              pubkey,
              mint: tokenAccount.mint,
              balance,
              actualBalance,
              tokenInfo,
              displayName: `${actualBalance.toFixed(6)} ${tokenInfo.symbol}`
            };
            
            // Check if account is inactive (only if requested)
            if (checkInactivity) {
              const isInactive = await isTokenAccountInactive(conn, pubkey);
              if (isInactive) {
                console.log(`    ⏰ Token account is inactive (5+ days)`);
                tokenData.isInactive = true;
                inactiveAccounts.push(tokenData);
              } else {
                console.log(`    ✅ Token account is active`);
                accountsWithBalances.push(tokenData);
              }
            } else {
              accountsWithBalances.push(tokenData);
            }
          } else {
            console.log(`    🪙 Empty token account: ${pubkey.toString()}`);
            emptyAccounts.push({ owner, pubkey });
          }
        } catch (error) {
          console.error(`    ❌ Error reading token account ${pubkey.toString()}:`, error.message);
          // Assume it's empty if we can't read it
          emptyAccounts.push({ owner, pubkey });
        }
      }
    } catch (error) {
      console.error(`❌ Error getting token accounts for ${owner.publicKey.toString()}:`, error.message);
    }
  }
  
  return { accountsWithBalances, emptyAccounts, inactiveAccounts };
}

// Process selected tokens for burning
async function processSelectedTokens(privateKeyStrings, consolidateTo, selectedTokens, allTokens) {
  console.log('\n🔥 Processing selected tokens for burning...');
  const conn = new Connection(RPC_URL, 'confirmed');
  const owners = privateKeyStrings.map(s => Keypair.fromSecretKey(bs58.decode(s)));
  
  const rentDestination = consolidateTo ? new PublicKey(consolidateTo) : owners[0].publicKey;
  console.log('📍 Token account rent destination:', rentDestination.toString());
  
  const burnJobs = [];
  let actualReclaimedLamports = 0;
  
  // Prepare burn instructions for selected tokens and calculate actual rent
  for (const tokenIndex of selectedTokens) {
    const token = allTokens[tokenIndex];
    if (token) {
      console.log(`🔥 Will burn: ${token.displayName}`);
      
      // Get actual account rent before burning
      try {
        const accountInfo = await conn.getAccountInfo(token.pubkey);
        if (accountInfo) {
          actualReclaimedLamports += accountInfo.lamports;
        }
      } catch (error) {
        console.log(`Warning: Could not get account info for ${token.pubkey.toString()}`);
        // Fallback to estimated amount
        actualReclaimedLamports += 0.00203928 * 1e9;
      }
      
      burnJobs.push({
        owner: token.owner,
        pubkey: token.pubkey,
        burnIx: createBurnInstruction(
          token.pubkey,
          token.mint,
          token.owner.publicKey,
          token.balance
        ),
        closeIx: createCloseAccountInstruction(token.pubkey, rentDestination, token.owner.publicKey, [])
      });
    }
  }
  
  console.log(`🔥 Total tokens to burn: ${burnJobs.length}`);
  console.log(`💰 Actual rent to be reclaimed: ${(actualReclaimedLamports / 1e9).toFixed(6)} SOL`);
  
  if (burnJobs.length > 0) {
    // Process burns in batches
    const BATCH = 3; // Smaller batches for burn operations
    for (let i = 0; i < burnJobs.length; i += BATCH) {
      const slice = burnJobs.slice(i, i + BATCH);
      console.log(`\n🔥 Burning batch ${Math.floor(i/BATCH) + 1}/${Math.ceil(burnJobs.length/BATCH)} (${slice.length} tokens)`);
      
      try {
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        
        const instructions = [];
        slice.forEach(job => {
          instructions.push(job.burnIx, job.closeIx);
        });
        
        const message = new TransactionMessage({
          payerKey: FEE_PAYER.publicKey,
          recentBlockhash: blockhash,
          instructions,
        }).compileToV0Message();
        
        const tx = new VersionedTransaction(message);
        const signers = [FEE_PAYER, ...new Set(slice.map(j => j.owner))];
        tx.sign(signers);
        
        console.log('🧪 Simulating burn transaction...');
        const simulation = await conn.simulateTransaction(tx);
        
        if (simulation.value.err) {
          console.error('❌ Burn simulation failed:', JSON.stringify(simulation.value, null, 2));
          throw new Error(`Burn simulation failed: ${JSON.stringify(simulation.value.err)}`);
        }
        
        console.log('✅ Burn simulation successful');
        console.log('📤 Sending burn transaction...');
        
        const sig = await conn.sendRawTransaction(tx.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 3,
        });
        
        console.log('✅ Burn transaction sent:', sig);
        await confirmByPolling(conn, sig);
        
      } catch (error) {
        console.error(`❌ Error in burn batch ${Math.floor(i/BATCH) + 1}:`, error.message);
        throw error;
      }
    }
  }
  
  return {
    burnCount: burnJobs.length,
    actualReclaimedLamports
  };
}

// Process selected tokens for burning with fee collection
async function processSelectedTokensWithFees(privateKeyStrings, consolidateTo, selectedTokens, allTokens, userId = null) {
  const result = await processSelectedTokens(privateKeyStrings, consolidateTo, selectedTokens, allTokens);
  
  // Extract actual reclaimed amounts and burned count
  const { burnCount, actualReclaimedLamports = 0 } = result;
  
  // Collect fees from burned token accounts using actual amounts
  if (burnCount > 0 && actualReclaimedLamports > 1000) {
    console.log('\n💰 Collecting fees from burned token accounts...');
    const conn = new Connection(RPC_URL, 'confirmed');
    const rentDestination = consolidateTo ? new PublicKey(consolidateTo) : Keypair.fromSecretKey(bs58.decode(privateKeyStrings[0])).publicKey;
    const owners = privateKeyStrings.map(s => Keypair.fromSecretKey(bs58.decode(s)));
    
    const feeCalc = calculateFeeAndCreateInstructions(actualReclaimedLamports, rentDestination, userId, privateKeyStrings.length);
    
    if (feeCalc.feeInstructions.length > 0) {
      try {
        console.log(`💲 Collecting ${feeCalc.feeAmount.toFixed(6)} SOL fee (${(FEE_RATE * 100)}%) from burned tokens`);
        
        // Find the correct keypair to sign the transaction
        const feeDestinationKeypair = owners.find(o => o.publicKey.toString() === rentDestination.toString());
        if (!feeDestinationKeypair) {
          throw new Error('Fee destination keypair not found in owners');
        }
        
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        const feeMessage = new TransactionMessage({
          payerKey: FEE_PAYER.publicKey,
          recentBlockhash: blockhash,
          instructions: feeCalc.feeInstructions,
        }).compileToV0Message();
        
        const feeTx = new VersionedTransaction(feeMessage);
        feeTx.sign([FEE_PAYER, feeDestinationKeypair]);
        
        const feeSig = await conn.sendRawTransaction(feeTx.serialize());
        await confirmByPolling(conn, feeSig);
        
        console.log(`✅ Fee collection successful from burned tokens: ${feeSig}`);
        return {
          burnCount,
          actualReclaimedLamports,
          feesCollected: feeCalc.feeLamports,
          netUserAmount: feeCalc.userLamports
        };
      } catch (feeError) {
        console.error('⚠️ Fee collection failed for burned tokens (continuing with operation):', feeError.message);
        if (feeError.stack) {
          console.error('Fee collection error stack:', feeError.stack);
        }
      }
    } else if (feeCalc.isFeeless) {
      console.log(`🎁 Feeless service applied for referral user - no fees collected from burned tokens`);
    }
  }
  
  return {
    burnCount: burnCount || 0,
    actualReclaimedLamports: actualReclaimedLamports || 0,
    feesCollected: 0,
    netUserAmount: actualReclaimedLamports || 0
  };
}

// The core close + reclaim logic for empty accounts
async function processEmptyAccounts(privateKeyStrings, consolidateTo, emptyAccounts, userId = null) {
  console.log('\n🚀 Processing empty token accounts...');
  
  if (emptyAccounts.length === 0) {
    console.log('ℹ️ No empty accounts to close');
    return { closed: 0, reclaimedSol: 0, feesCollected: 0, netUserAmount: 0 };
  }
  
  const conn = new Connection(RPC_URL, 'confirmed');
  const owners = privateKeyStrings.map(s => Keypair.fromSecretKey(bs58.decode(s)));
  const rentDestination = consolidateTo ? new PublicKey(consolidateTo) : owners[0].publicKey;
  
  console.log(`📈 Total empty accounts to close: ${emptyAccounts.length}`);
  
  // Create close instructions
  const jobs = emptyAccounts.map(({ owner, pubkey }) => ({
    owner,
    pubkey,
    ix: createCloseAccountInstruction(pubkey, rentDestination, owner.publicKey, [])
  }));
  
  // Batch-close (6 at a time)
  const BATCH = 6;
  let batchTxSig = null;
  let actualReclaimedLamports = 0;
  
  // Get balances before closing to calculate actual reclaimed amounts
  for (const job of jobs) {
    try {
      const accountInfo = await conn.getAccountInfo(job.pubkey);
      if (accountInfo) {
        actualReclaimedLamports += accountInfo.lamports;
      }
    } catch (error) {
      console.log(`Warning: Could not get account info for ${job.pubkey.toString()}`);
      // Fallback to estimated amount
      actualReclaimedLamports += 0.00203928 * 1e9;
    }
  }
  
  console.log(`💰 Actual rent to be reclaimed: ${(actualReclaimedLamports / 1e9).toFixed(6)} SOL`);
  
  for (let i = 0; i < jobs.length; i += BATCH) {
    const slice = jobs.slice(i, i + BATCH);
    console.log(`\n📦 Processing empty accounts batch ${Math.floor(i/BATCH) + 1}/${Math.ceil(jobs.length/BATCH)} (${slice.length} instructions)`);
    
    try {
      const { blockhash } = await conn.getLatestBlockhash('confirmed');
      const message = new TransactionMessage({
        payerKey: FEE_PAYER.publicKey,
        recentBlockhash: blockhash,
        instructions: slice.map(j => j.ix),
      }).compileToV0Message();
      
      const tx = new VersionedTransaction(message);
      const signers = [FEE_PAYER, ...new Set(slice.map(j => j.owner))];
      tx.sign(signers);
      
      console.log('🧪 Simulating empty accounts transaction...');
      const simulation = await conn.simulateTransaction(tx);
      
      if (simulation.value.err) {
        console.error('❌ Empty accounts simulation failed:', JSON.stringify(simulation.value, null, 2));
        throw new Error(`Empty accounts simulation failed: ${JSON.stringify(simulation.value.err)}`);
      }
      
      console.log('✅ Empty accounts simulation successful');
      console.log('📤 Sending empty accounts transaction...');
      
      batchTxSig = await conn.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
        maxRetries: 3,
      });
      
      console.log('✅ Empty accounts transaction sent:', batchTxSig);
      await confirmByPolling(conn, batchTxSig);
      
    } catch (error) {
      console.error(`❌ Error in empty accounts batch ${Math.floor(i/BATCH) + 1}:`, error.message);
      throw error;
    }
  }
  
  // Reclaim leftover SOL with fee collection
  console.log('\n💰 Reclaiming leftover SOL and collecting fees...');
  let totalReclaimedLamports = 0;
  let totalFeesCollected = 0;
  
  for (const owner of owners) {
    const bal = await conn.getBalance(owner.publicKey);
    if (bal > 0) {
      totalReclaimedLamports += bal;
      const transferTo = consolidateTo ? new PublicKey(consolidateTo) : owner.publicKey;
      
      if (transferTo.toString() !== owner.publicKey.toString()) {
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        const message = new TransactionMessage({
          payerKey: FEE_PAYER.publicKey,
          recentBlockhash: blockhash,
          instructions: [
            SystemProgram.transfer({
              fromPubkey: owner.publicKey,
              toPubkey: transferTo,
              lamports: bal,
            })
          ],
        }).compileToV0Message();
        
        const tx = new VersionedTransaction(message);
        tx.sign([FEE_PAYER, owner]);
        
        const sig = await conn.sendRawTransaction(tx.serialize());
        await confirmByPolling(conn, sig);
      }
    }
  }
  
  // Use actual reclaimed amount instead of estimate
  const totalReclaimed = actualReclaimedLamports + totalReclaimedLamports;
  
  // Collect fees from the rent destination using actual amounts
  if (totalReclaimed > 1000) {
    const feeDestination = consolidateTo ? new PublicKey(consolidateTo) : owners[0].publicKey;
    const feeCalc = calculateFeeAndCreateInstructions(totalReclaimed, feeDestination, userId, privateKeyStrings.length);
    
    if (feeCalc.feeInstructions.length > 0) {
      try {
        console.log(`💲 Collecting ${feeCalc.feeAmount.toFixed(6)} SOL fee (${(FEE_RATE * 100)}%) from empty accounts`);
        
        // Create fee collection transaction with proper signer
        const feeDestinationKeypair = owners.find(o => o.publicKey.toString() === feeDestination.toString());
        if (!feeDestinationKeypair) {
          throw new Error('Fee destination keypair not found in owners');
        }
        
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        const feeMessage = new TransactionMessage({
          payerKey: FEE_PAYER.publicKey,
          recentBlockhash: blockhash,
          instructions: feeCalc.feeInstructions,
        }).compileToV0Message();
        
        const feeTx = new VersionedTransaction(feeMessage);
        feeTx.sign([FEE_PAYER, feeDestinationKeypair]);
        
        const feeSig = await conn.sendRawTransaction(feeTx.serialize());
        await confirmByPolling(conn, feeSig);
        
        totalFeesCollected = feeCalc.feeLamports;
        console.log(`✅ Fee collection successful from empty accounts: ${feeSig}`);
      } catch (feeError) {
        console.error('⚠️ Fee collection failed from empty accounts (continuing with operation):', feeError.message);
        if (feeError.stack) {
          console.error('Fee collection error stack:', feeError.stack);
        }
        
        // Log specific error types for better monitoring
        if (feeError.message.includes('Transaction signature verification failure')) {
          console.log('📊 Fee collection skipped due to transaction signature verification failure - this is usually temporary');
        } else if (feeError.message.includes('insufficient funds')) {
          console.log('📊 Fee collection skipped due to insufficient funds in fee payer account');
        } else if (feeError.message.includes('Simulation failed')) {
          console.log('📊 Fee collection skipped due to simulation failure - network conditions may be unstable');
        }
      }
    } else if (feeCalc.isFeeless) {
      console.log(`🎁 Feeless service applied for referral user - no fees collected from empty accounts`);
    }
  }
  
  return {
    closed: jobs.length,
    reclaimedSol: totalReclaimed / 1e9,
    feesCollected: totalFeesCollected / 1e9,
    netUserAmount: (totalReclaimed - totalFeesCollected) / 1e9,
    batchTxSig
  };
}

const bot = new Telegraf(BOT_TOKEN);

// 1) /start
bot.start(async ctx => {
  console.log(`👤 User started bot: ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  userState.delete(ctx.from.id);
  
  // Detect and log user language
  const userLang = detectUserLanguage(ctx);
  console.log(`🌐 User ${ctx.from.id} language: ${userLang}`);
  
  // Check for referral code in start parameter
  const startPayload = ctx.startPayload;
  let referralMessage = '';
  let feeMessage = t(ctx, 'rewards_fees') + '\n\n';
  
  if (startPayload && REFERRAL_CODES[startPayload]) {
    const referralConfig = REFERRAL_CODES[startPayload];
    
    // Track referral user
    referralUsers.set(ctx.from.id, {
      referralCode: startPayload,
      walletCount: 0,
      joinedAt: new Date().toISOString()
    });
    
    console.log(`🎉 Referral user detected: ${ctx.from.id} from ${referralConfig.name}`);
    
    referralMessage = t(ctx, 'referral_welcome_msg', 
      referralConfig.name.toUpperCase(), 
      referralConfig.freeWallets, 
      referralConfig.freeWallets
    ) + '\n\n';
    
    feeMessage = t(ctx, 'referral_benefits', 
      referralConfig.name.toUpperCase(), 
      referralConfig.freeWallets,
      referralConfig.freeWallets,
      referralConfig.freeWallets,
      referralConfig.freeWallets,
      referralConfig.freeWallets
    ) + '\n\n';
  }
  
  const who = ctx.from.username || ctx.from.first_name;
  await ctx.replyWithHTML(
    t(ctx, 'welcome_to', who) + '\n\n' +
    referralMessage +
    t(ctx, 'what_we_offer') + '\n\n' +
    feeMessage +
    t(ctx, 'no_sol_needed') + '\n\n' +
    t(ctx, 'open_source') + '\n\n' +
    t(ctx, 'choose_action'),
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t(ctx, 'continue_cleanup'), 'CONTINUE')],
        [Markup.button.callback(t(ctx, 'burn_leftover'), 'BURN_LEFTOVER')],
        [Markup.button.callback(t(ctx, 'language_selector'), 'LANGUAGE_SELECT')]
      ]).reply_markup,
      disable_web_page_preview: true,
      parse_mode: 'HTML'
    }
  );
});

// Language selection handler
bot.action('LANGUAGE_SELECT', async ctx => {
  console.log(`🌐 User ${ctx.from.id} clicked language selector`);
  await ctx.editMessageText(
    t(ctx, 'select_language'),
    {
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t(ctx, 'english_button'), 'LANG_EN')],
        [Markup.button.callback(t(ctx, 'russian_button'), 'LANG_RU')],
        [Markup.button.callback(t(ctx, 'back_button'), 'BACK_TO_START')]
      ]).reply_markup,
      parse_mode: 'HTML'
    }
  );
});

// Language selection handlers
bot.action('LANG_EN', async ctx => {
  console.log(`🇺🇸 User ${ctx.from.id} selected English`);
  setUserLanguage(ctx.from.id, 'en');
  await ctx.editMessageText(
    t(ctx, 'language_set_english'),
    { parse_mode: 'HTML' }
  );
  setTimeout(async () => {
    userState.delete(ctx.from.id);
    // Simulate /start command
    await ctx.deleteMessage();
    // Trigger start command logic
    const startPayload = null;
    let referralMessage = '';
    let feeMessage = t(ctx, 'rewards_fees') + '\n\n';
    
    const who = ctx.from.username || ctx.from.first_name;
    await ctx.replyWithHTML(
      t(ctx, 'welcome_to', who) + '\n\n' +
      referralMessage +
      t(ctx, 'what_we_offer') + '\n\n' +
      feeMessage +
      t(ctx, 'no_sol_needed') + '\n\n' +
      t(ctx, 'open_source') + '\n\n' +
      t(ctx, 'choose_action'),
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t(ctx, 'continue_cleanup'), 'CONTINUE')],
          [Markup.button.callback(t(ctx, 'burn_leftover'), 'BURN_LEFTOVER')],
          [Markup.button.callback(t(ctx, 'language_selector'), 'LANGUAGE_SELECT')]
        ]).reply_markup,
        disable_web_page_preview: true,
        parse_mode: 'HTML'
      }
    );
  }, 1000);
});

bot.action('LANG_RU', async ctx => {
  console.log(`🇷🇺 User ${ctx.from.id} selected Russian`);
  setUserLanguage(ctx.from.id, 'ru');
  await ctx.editMessageText(
    t(ctx, 'language_set_russian'),
    { parse_mode: 'HTML' }
  );
  setTimeout(async () => {
    userState.delete(ctx.from.id);
    // Simulate /start command
    await ctx.deleteMessage();
    // Trigger start command logic
    const startPayload = null;
    let referralMessage = '';
    let feeMessage = t(ctx, 'rewards_fees') + '\n\n';
    
    const who = ctx.from.username || ctx.from.first_name;
    await ctx.replyWithHTML(
      t(ctx, 'welcome_to', who) + '\n\n' +
      referralMessage +
      t(ctx, 'what_we_offer') + '\n\n' +
      feeMessage +
      t(ctx, 'no_sol_needed') + '\n\n' +
      t(ctx, 'open_source') + '\n\n' +
      t(ctx, 'choose_action'),
      {
        reply_markup: Markup.inlineKeyboard([
          [Markup.button.callback(t(ctx, 'continue_cleanup'), 'CONTINUE')],
          [Markup.button.callback(t(ctx, 'burn_leftover'), 'BURN_LEFTOVER')],
          [Markup.button.callback(t(ctx, 'language_selector'), 'LANGUAGE_SELECT')]
        ]).reply_markup,
        disable_web_page_preview: true,
        parse_mode: 'HTML'
      }
    );
  }, 1000);
});

// 2) CONTINUE → ask for keys
bot.action('CONTINUE', async ctx => {
  console.log(`🔄 User ${ctx.from.id} clicked Continue`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    t(ctx, 'provide_keys'),
    { reply_markup: { force_reply: true } }
  );
  userState.set(ctx.from.id, { stage:'AWAITING_KEYS' });
});

// 2b) BURN_LEFTOVER → detailed explanation
bot.action('BURN_LEFTOVER', async ctx => {
  console.log(`🔥 User ${ctx.from.id} clicked Burn Leftover`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    t(ctx, 'burn_explanation'),
    Markup.inlineKeyboard([
      [Markup.button.callback(t(ctx, 'start_burning'), 'BURN_START_FROM_MAIN')],
      [Markup.button.callback(t(ctx, 'back_to_menu'), 'BACK_TO_START')]
    ])
  );
});

// Back to start handler
bot.action('BACK_TO_START', async ctx => {
  console.log(`⬅️ User ${ctx.from.id} went back to start`);
  userState.delete(ctx.from.id);
  const who = ctx.from.username || ctx.from.first_name;
  await ctx.editMessageText(
    t(ctx, 'back_to_start_msg', who),
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback(t(ctx, 'full_cleanup_button'), 'CONTINUE')],
        [Markup.button.callback(t(ctx, 'burn_leftover_button'), 'BURN_LEFTOVER')]
      ]).reply_markup
    }
  );
});

// Start burning from main menu
bot.action('BURN_START_FROM_MAIN', async ctx => {
  console.log(`🔥 User ${ctx.from.id} started burn from main menu`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    t(ctx, 'connect_wallet_burn'),
    { reply_markup: { force_reply: true } }
  );
  userState.set(ctx.from.id, { stage: 'BURN_AWAITING_KEYS' });
});

// Command handlers - must be before message handler
bot.command('stats', async ctx => {
  console.log(`📊 Stats requested by user ${ctx.from.id}`);
  try {
    console.log('📊 Reading stats directory...');
    const files = await fs.readdir(STATS_DIR);
    const statsFiles = files.filter(f => f.endsWith('.json'));
    console.log(`📊 Found ${statsFiles.length} stats files`);
    
    // Initialize comprehensive stats
    const stats = {
      totalUsers: new Set(),
      totalSol: 0,
      totalUsdValue: 0,
      totalFeesCollected: 0,
      totalFeeUsdValue: 0,
      totalGrossSol: 0,
      totalWallets: 0,
      totalBurnedTokens: 0,
      totalClosedAccounts: 0,
      totalEmptyAccountsClosed: 0,
      burnOnlyOperations: 0,
      fullCleanupOperations: 0,
      mostRecentOperation: null,
      topUser: { username: '', sol: 0 },
      uniqueTokenSymbols: new Set(),
      operationsByDay: new Map()
    };
    
    // Process each stats file
    for (const file of statsFiles) {
      try {
        const data = JSON.parse(await fs.readFile(path.join(STATS_DIR, file), 'utf8'));
        
        // Track unique users
        stats.totalUsers.add(data.userId);
        
        // Accumulate totals
        stats.totalSol += data.earnedSol || 0; // Net SOL to users
        stats.totalUsdValue += data.usdValue || 0; // Net USD to users
        stats.totalFeesCollected += data.feesCollected || 0;
        stats.totalFeeUsdValue += data.feeUsdValue || 0;
        stats.totalGrossSol += data.grossSol || data.earnedSol || 0; // Total before fees
        stats.totalWallets += data.wallets || 0;
        stats.totalBurnedTokens += data.burnedTokens || 0;
        stats.totalClosedAccounts += data.closedAccounts || 0;
        stats.totalEmptyAccountsClosed += data.emptyAccountsClosed || 0;
        
        // Track operation types
        if (data.burnOnly) {
          stats.burnOnlyOperations++;
        } else {
          stats.fullCleanupOperations++;
        }
        
        // Track most recent operation
        if (!stats.mostRecentOperation || new Date(data.timestamp) > new Date(stats.mostRecentOperation.timestamp)) {
          stats.mostRecentOperation = data;
        }
        
        // Track top user
        if ((data.earnedSol || 0) > stats.topUser.sol) {
          stats.topUser = {
            username: data.username || 'Anonymous',
            sol: data.earnedSol || 0,
            usdValue: data.usdValue || 0
          };
        }
        
        // Track unique token symbols
        if (data.burnedTokenDetails) {
          data.burnedTokenDetails.forEach(token => {
            if (token.symbol) {
              stats.uniqueTokenSymbols.add(token.symbol);
            }
          });
        }
        
        // Track operations by day
        if (data.timestamp) {
          const date = new Date(data.timestamp).toISOString().split('T')[0];
          stats.operationsByDay.set(date, (stats.operationsByDay.get(date) || 0) + 1);
        }
      } catch (error) {
        console.error(`Error processing stats file ${file}:`, error.message);
      }
    }
    
    // Get current SOL price for USD conversion
    console.log('📊 Fetching SOL price...');
    const solPrice = await getSolToUsdRate();
    console.log(`📊 SOL price: $${solPrice}`);
    const currentUsdValue = stats.totalSol * solPrice;
    
    // Calculate average SOL per user
    const avgSolPerUser = stats.totalUsers.size > 0 ? stats.totalSol / stats.totalUsers.size : 0;
    const avgWalletsPerUser = stats.totalUsers.size > 0 ? stats.totalWallets / stats.totalUsers.size : 0;
    
    // Get recent activity (last 7 days)
    const last7Days = Array.from({length: 7}, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - i);
      return date.toISOString().split('T')[0];
    });
    const recentActivity = last7Days.reduce((sum, date) => sum + (stats.operationsByDay.get(date) || 0), 0);
    
    // Build comprehensive stats message
    let message = `📊 <b>Comprehensive Bot Statistics</b>\n\n`;
    
    // Core metrics
    message += `👥 <b>Users & Operations</b>\n`;
    message += `• Total Unique Users: ${stats.totalUsers.size}\n`;
    message += `• Total Operations: ${stats.burnOnlyOperations + stats.fullCleanupOperations}\n`;
    message += `• Burn-Only Operations: ${stats.burnOnlyOperations}\n`;
    message += `• Full Cleanup Operations: ${stats.fullCleanupOperations}\n`;
    message += `• Recent Activity (7 days): ${recentActivity} operations\n\n`;
    
    // Financial metrics
    message += `💰 <b>Financial Impact</b>\n`;
    message += `• Total SOL to Users: ${stats.totalSol.toFixed(6)} SOL\n`;
    message += `• Total Fees Collected: ${stats.totalFeesCollected.toFixed(6)} SOL\n`;
    message += `• Total SOL Processed: ${stats.totalGrossSol.toFixed(6)} SOL\n`;
    message += `• Current User USD Value: ~$${currentUsdValue.toFixed(2)}\n`;
    message += `• Historical User USD: ~$${stats.totalUsdValue.toFixed(2)}\n`;
    message += `• Total Fee USD: ~$${stats.totalFeeUsdValue.toFixed(2)}\n`;
    message += `• Average SOL per User: ${avgSolPerUser.toFixed(6)} SOL\n\n`;
    
    // Wallet & account metrics
    message += `🏦 <b>Wallet & Account Metrics</b>\n`;
    message += `• Total Wallets Processed: ${stats.totalWallets}\n`;
    message += `• Average Wallets per User: ${avgWalletsPerUser.toFixed(1)}\n`;
    message += `• Total Accounts Closed: ${stats.totalClosedAccounts}\n`;
    message += `• Empty Accounts Closed: ${stats.totalEmptyAccountsClosed}\n`;
    message += `• Token Accounts Burned: ${stats.totalBurnedTokens}\n\n`;
    
    // Token metrics
    message += `🔥 <b>Token Metrics</b>\n`;
    message += `• Total Tokens Burned: ${stats.totalBurnedTokens}\n`;
    message += `• Unique Token Types: ${stats.uniqueTokenSymbols.size}\n\n`;
    
    // Top performer
    if (stats.topUser.sol > 0) {
      message += `🏆 <b>Top User</b>\n`;
      message += `• Username: ${stats.topUser.username}\n`;
      message += `• SOL Reclaimed: ${stats.topUser.sol.toFixed(6)} SOL\n`;
      if (stats.topUser.usdValue > 0) {
        message += `• USD Value: ~$${stats.topUser.usdValue.toFixed(2)}\n`;
      }
      message += `\n`;
    }
    
    // Recent activity
    if (stats.mostRecentOperation) {
      const timeDiff = Date.now() - new Date(stats.mostRecentOperation.timestamp).getTime();
      
      // Calculate time components
      const days = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((timeDiff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((timeDiff % (1000 * 60)) / 1000);
      
      // Format time text
      let timeAgoText = '';
      if (days > 0) {
        timeAgoText = `${days}d ${hours}h ago`;
      } else if (hours > 0) {
        timeAgoText = `${hours}h ${minutes}m ago`;
      } else if (minutes > 0) {
        timeAgoText = `${minutes}m ${seconds}s ago`;
      } else {
        timeAgoText = `${seconds}s ago`;
      }
      
      message += `⏰ <b>Recent Activity</b>\n`;
      message += `• Last Operation: ${timeAgoText}\n`;
      message += `• By: ${stats.mostRecentOperation.username || 'Anonymous'}\n`;
      // Use grossSol if available, otherwise earnedSol, otherwise netUserAmount
      const reclaimedSol = stats.mostRecentOperation.grossSol || stats.mostRecentOperation.earnedSol || stats.mostRecentOperation.netUserAmount || 0;
      message += `• Reclaimed: ${reclaimedSol.toFixed(6)} SOL\n`;
    }
    
    console.log('📊 Sending stats message...');
    await ctx.replyWithHTML(message);
    console.log('✅ Stats sent successfully');
    
  } catch (error) {
    console.error('❌ Error getting comprehensive stats:', error.message);
    console.error('Stack trace:', error.stack);
    await ctx.reply(t(ctx, 'stats_error'));
  }
});

bot.command('burntokens', async ctx => {
  console.log(`🔥 Burn tokens command requested by user ${ctx.from.id}`);
  userState.delete(ctx.from.id);
  await ctx.replyWithHTML(
    t(ctx, 'burn_command_text'),
    Markup.inlineKeyboard([
      [Markup.button.callback(t(ctx, 'start_burning_button'), 'BURN_START_FROM_MAIN')],
      [Markup.button.callback(t(ctx, 'back_main_menu_button'), 'BACK_TO_START')]
    ])
  );
});

// 3) capture keys
bot.on('message', async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;

  // -- Stage: keys →
  if (st.stage==='AWAITING_KEYS' && ctx.message.reply_to_message) {
    console.log(`🔐 User ${ctx.from.id} provided keys`);
    await ctx.deleteMessage();
    await ctx.deleteMessage(ctx.message.reply_to_message.message_id);

    const parts = ctx.message.text.trim().split(/[\s,]+/).filter(Boolean);
    console.log(`📊 Number of keys provided: ${parts.length}`);
    
    if (parts.some(s=>{ try{bs58.decode(s);return false;}catch{return true;} })) {
      console.log(`❌ Invalid keys provided by user ${ctx.from.id}`);
      await ctx.reply(t(ctx, 'invalid_key_start'));
      return userState.delete(ctx.from.id);
    }

    console.log(`✅ All keys valid for user ${ctx.from.id}`);
    const aesKey = genAESKey(),
          encrypted = encryptAES(aesKey, JSON.stringify(parts));
    
    // Scan for tokens first
    const loadingMsg = await ctx.reply(t(ctx, 'scanning'));
    
    try {
      const { accountsWithBalances, emptyAccounts } = await scanTokenAccounts(parts);
      await ctx.deleteMessage(loadingMsg.message_id);
      
      userState.set(ctx.from.id, { 
        ...st, 
        aesKey, 
        encrypted, 
        accountsWithBalances,
        emptyAccounts,
        stage:'AWAITING_CONSOLIDATION' 
      });

      if (accountsWithBalances.length > 0) {
        await ctx.replyWithHTML(
          t(ctx, 'tokens_with_balances_simple', accountsWithBalances.length, emptyAccounts.length),
          Markup.inlineKeyboard([
            Markup.button.callback(t(ctx, 'consolidate_yes'), 'CHOICE_YES'),
            Markup.button.callback(t(ctx, 'consolidate_no'), 'CHOICE_NO')
          ])
        );
      } else if (emptyAccounts.length > 0) {
        await ctx.replyWithHTML(
          t(ctx, 'empty_accounts_simple', emptyAccounts.length),
          Markup.inlineKeyboard([
            Markup.button.callback(t(ctx, 'consolidate_yes'), 'CHOICE_YES'),
            Markup.button.callback(t(ctx, 'consolidate_no'), 'CHOICE_NO')
          ])
        );
      } else {
        await ctx.reply(t(ctx, 'wallets_optimized'));
        userState.delete(ctx.from.id);
      }
      
    } catch (error) {
      await ctx.deleteMessage(loadingMsg.message_id);
      console.error(`❌ Error scanning tokens for user ${ctx.from.id}:`, error.message);
      
      // Handle specific error types with user-friendly messages
      if (error.message.includes('bad secret key size')) {
        await ctx.reply(t(ctx, 'bad_secret_key'));
      } else if (error.message.includes('Invalid key')) {
        await ctx.reply(t(ctx, 'invalid_key_error'));
      } else {
        await ctx.reply(t(ctx, 'scan_error'));
      }
      
      userState.delete(ctx.from.id);
    }
  }

  // -- Stage: payout address →
  if (st.stage==='AWAITING_PAYOUT_ADDR' && ctx.message.reply_to_message) {
    console.log(`📍 User ${ctx.from.id} provided payout address`);
    const addr = ctx.message.text.trim();
    await ctx.deleteMessage();
    await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
    
    try {
      new PublicKey(addr);
      console.log(`✅ Valid payout address: ${addr}`);
    } catch (error) {
      console.log(`❌ Invalid payout address: ${addr}`);
      await ctx.reply(t(ctx, 'invalid_address_start'));
      return userState.delete(ctx.from.id);
    }
    
    userState.set(ctx.from.id, { ...st, payoutAddr: addr, stage:'TOKEN_SELECTION' });
    await showTokenSelection(ctx);
  }

  // -- Stage: burn tokens keys →
  if (st.stage==='BURN_AWAITING_KEYS' && ctx.message.reply_to_message) {
    console.log(`🔥 User ${ctx.from.id} provided keys for burning`);
    await ctx.deleteMessage();
    await ctx.deleteMessage(ctx.message.reply_to_message.message_id);

    const parts = ctx.message.text.trim().split(/[\s,]+/).filter(Boolean);
    console.log(`📊 Number of keys provided for burning: ${parts.length}`);
    
    if (parts.some(s=>{ try{bs58.decode(s);return false;}catch{return true;} })) {
      console.log(`❌ Invalid keys provided by user ${ctx.from.id} for burning`);
      await ctx.reply(t(ctx, 'invalid_key_burn'));
      return userState.delete(ctx.from.id);
    }

    console.log(`✅ All keys valid for burning for user ${ctx.from.id}`);
    const aesKey = genAESKey(),
          encrypted = encryptAES(aesKey, JSON.stringify(parts));
    
    const loadingMsg = await ctx.reply(t(ctx, 'scanning_burn'));
    
    try {
      const { accountsWithBalances, emptyAccounts, inactiveAccounts } = await scanTokenAccounts(parts, true);
      await ctx.deleteMessage(loadingMsg.message_id);
      
      if (accountsWithBalances.length === 0 && inactiveAccounts.length === 0) {
        await ctx.reply(t(ctx, 'no_tokens_burn'));
        return userState.delete(ctx.from.id);
      }
      
      userState.set(ctx.from.id, { 
        ...st, 
        aesKey, 
        encrypted, 
        accountsWithBalances,
        emptyAccounts,
        inactiveAccounts,
        stage:'BURN_CONSOLIDATION',
        burnOnly: true
      });

      if (inactiveAccounts.length > 0) {
        // Show inactive accounts first for confirmation
        await ctx.replyWithHTML(
          t(ctx, 'inactive_tokens_simple', inactiveAccounts.length, inactiveAccounts.length, accountsWithBalances.length, emptyAccounts.length),
          Markup.inlineKeyboard([
            [Markup.button.callback(t(ctx, 'yes_burn_inactive'), 'BURN_INACTIVE_YES')],
            [Markup.button.callback(t(ctx, 'choose_manually'), 'BURN_INACTIVE_MANUAL')],
            [Markup.button.callback(t(ctx, 'skip_inactive'), 'BURN_INACTIVE_SKIP')]
          ])
        );
      } else {
        await ctx.replyWithHTML(
          t(ctx, 'active_tokens_simple', accountsWithBalances.length),
          Markup.inlineKeyboard([
            Markup.button.callback(t(ctx, 'consolidate_yes'), 'BURN_CHOICE_YES'),
            Markup.button.callback(t(ctx, 'consolidate_no'), 'BURN_CHOICE_NO')
          ])
        );
      }
      
    } catch (error) {
      await ctx.deleteMessage(loadingMsg.message_id);
      console.error(`❌ Error scanning tokens for burning for user ${ctx.from.id}:`, error.message);
      
      // Handle specific error types with user-friendly messages
      if (error.message.includes('bad secret key size')) {
        await ctx.reply(t(ctx, 'bad_secret_key_burn'));
      } else if (error.message.includes('Invalid key')) {
        await ctx.reply(t(ctx, 'invalid_key_error_burn'));
      } else {
        await ctx.reply(t(ctx, 'scan_error_burn'));
      }
      
      userState.delete(ctx.from.id);
    }
  }

  // -- Stage: burn payout address →
  if (st.stage==='BURN_AWAITING_PAYOUT_ADDR' && ctx.message.reply_to_message) {
    console.log(`🔥 User ${ctx.from.id} provided burn payout address`);
    const addr = ctx.message.text.trim();
    await ctx.deleteMessage();
    await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
    
    try {
      new PublicKey(addr);
      console.log(`✅ Valid burn payout address: ${addr}`);
    } catch (error) {
      console.log(`❌ Invalid burn payout address: ${addr}`);
      await ctx.reply(t(ctx, 'invalid_address_burn'));
      return userState.delete(ctx.from.id);
    }
    
    userState.set(ctx.from.id, { ...st, payoutAddr: addr, stage:'BURN_TOKEN_SELECTION' });
    await showBurnTokenSelection(ctx);
  }
});

// 4) Consolidation choice
bot.action(/CHOICE_(YES|NO)/, async ctx => {
  console.log(`🔄 User ${ctx.from.id} chose consolidation: ${ctx.match[1]}`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  if (ctx.match[1]==='YES') {
    await ctx.reply(t(ctx, 'provide_sol_address'), {
      reply_markup:{ force_reply:true }
    });
    userState.set(ctx.from.id, { ...st, stage:'AWAITING_PAYOUT_ADDR' });
  } else {
    userState.set(ctx.from.id, { ...st, stage:'TOKEN_SELECTION', payoutAddr:null });
    await showTokenSelection(ctx);
  }
});

// Burn-specific consolidation choice
bot.action(/BURN_CHOICE_(YES|NO)/, async ctx => {
  console.log(`🔥 User ${ctx.from.id} chose burn consolidation: ${ctx.match[1]}`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  if (ctx.match[1]==='YES') {
    await ctx.reply(t(ctx, 'provide_sol_address'), {
      reply_markup:{ force_reply:true }
    });
    userState.set(ctx.from.id, { ...st, stage:'BURN_AWAITING_PAYOUT_ADDR' });
  } else {
    // Set up combined token list for selection
    const allTokens = [...(st.inactiveAccounts || []), ...(st.accountsWithBalances || [])];
    userState.set(ctx.from.id, { 
      ...st, 
      stage:'BURN_TOKEN_SELECTION', 
      payoutAddr:null,
      allTokensForSelection: allTokens
    });
    await showBurnTokenSelection(ctx);
  }
});

// Inactive token handlers
bot.action('BURN_INACTIVE_YES', async ctx => {
  console.log(`⏰ User ${ctx.from.id} chose to burn all inactive tokens`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  // Pre-select all inactive tokens
  const selectedTokens = new Set();
  const allTokens = [...(st.inactiveAccounts || []), ...(st.accountsWithBalances || [])];
  
  // Select all inactive tokens (first N indices)
  for (let i = 0; i < (st.inactiveAccounts?.length || 0); i++) {
    selectedTokens.add(i);
  }
  
  userState.set(ctx.from.id, { 
    ...st, 
    selectedTokens,
    allTokensForSelection: allTokens,
    stage:'BURN_CONSOLIDATION' 
  });

  await ctx.replyWithHTML(
    t(ctx, 'selected_inactive_burn', st.inactiveAccounts?.length || 0),
    Markup.inlineKeyboard([
      Markup.button.callback(t(ctx, 'consolidate_sol'), 'BURN_CHOICE_YES'),
      Markup.button.callback(t(ctx, 'keep_sol_wallets'), 'BURN_CHOICE_NO')
    ])
  );
});

bot.action('BURN_INACTIVE_MANUAL', async ctx => {
  console.log(`🔍 User ${ctx.from.id} chose manual selection`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  // Set up combined token list for manual selection
  const allTokens = [...(st.inactiveAccounts || []), ...(st.accountsWithBalances || [])];
  userState.set(ctx.from.id, { 
    ...st, 
    allTokensForSelection: allTokens
  });

  await ctx.replyWithHTML(
    t(ctx, 'manual_token_selection'),
    Markup.inlineKeyboard([
      Markup.button.callback(t(ctx, 'consolidate_sol'), 'BURN_CHOICE_YES'),
      Markup.button.callback(t(ctx, 'keep_sol_wallets'), 'BURN_CHOICE_NO')
    ])
  );
});

bot.action('BURN_INACTIVE_SKIP', async ctx => {
  console.log(`❌ User ${ctx.from.id} chose to skip inactive tokens`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  if ((st.accountsWithBalances?.length || 0) === 0) {
    await ctx.reply(t(ctx, 'no_active_tokens'));
    return userState.delete(ctx.from.id);
  }

  await ctx.replyWithHTML(
    t(ctx, 'active_tokens_only_burn', st.accountsWithBalances?.length || 0),
    Markup.inlineKeyboard([
      Markup.button.callback(t(ctx, 'consolidate_sol'), 'BURN_CHOICE_YES'),
      Markup.button.callback(t(ctx, 'keep_sol_wallets'), 'BURN_CHOICE_NO')
    ])
  );
});

// Token selection display
async function showTokenSelection(ctx) {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const { accountsWithBalances, emptyAccounts } = st;
  
  if (accountsWithBalances.length === 0) {
    // No tokens to select, process empty accounts directly
    await runProcessing(ctx, []);
    return;
  }
  
  const page = st.tokenPage || 0;
  const ITEMS_PER_PAGE = 8;
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, accountsWithBalances.length);
  const totalPages = Math.ceil(accountsWithBalances.length / ITEMS_PER_PAGE);
  
  const selectedTokens = st.selectedTokens || new Set();
  
  const buttons = [];
  
  // Token selection buttons
  for (let i = startIdx; i < endIdx; i++) {
    const token = accountsWithBalances[i];
    const isSelected = selectedTokens.has(i);
    const emoji = isSelected ? '✅' : '⭕';
    buttons.push([Markup.button.callback(
      `${emoji} ${token.displayName}`,
      `TOKEN_${i}`
    )]);
  }
  
  // Navigation and action buttons
  const navButtons = [];
  if (totalPages > 1) {
    if (page > 0) navButtons.push(Markup.button.callback(t(ctx, 'previous'), 'TOKEN_PREV'));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback(t(ctx, 'next'), 'TOKEN_NEXT'));
  }
  if (navButtons.length > 0) buttons.push(navButtons);
  
  // Action buttons
  const actionButtons = [];
  if (selectedTokens.size > 0) {
    const emptyCount = st.emptyAccounts?.length || 0;
    const buttonText = emptyCount > 0 
      ? t(ctx, 'burn_tokens_close_accounts', selectedTokens.size, emptyCount)
      : t(ctx, 'burn_tokens_only', selectedTokens.size);
    actionButtons.push(Markup.button.callback(buttonText, 'TOKEN_BURN'));
  }
  
  const emptyCount = st.emptyAccounts?.length || 0;
  const skipText = emptyCount > 0 
    ? t(ctx, 'skip_burning_close_accounts', emptyCount)
    : t(ctx, 'skip_burning');
  actionButtons.push(Markup.button.callback(skipText, 'TOKEN_SKIP'));
  buttons.push(actionButtons);
  
  // Back button
  buttons.push([Markup.button.callback(t(ctx, 'back_to_consolidation'), 'TOKEN_BACK_TO_CONSOLIDATION')]);
  
  const message = t(ctx, 'select_tokens_burn', 
    page + 1, totalPages, 
    startIdx + 1, endIdx, accountsWithBalances.length, 
    selectedTokens.size, 
    accountsWithBalances.length, 
    emptyCount);
  
  await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
}

// Burn-specific token selection display
async function showBurnTokenSelection(ctx) {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  // Combine inactive and active tokens for selection
  const allTokens = st.allTokensForSelection || [...(st.inactiveAccounts || []), ...(st.accountsWithBalances || [])];
  const page = st.tokenPage || 0;
  const ITEMS_PER_PAGE = 8;
  const startIdx = page * ITEMS_PER_PAGE;
  const endIdx = Math.min(startIdx + ITEMS_PER_PAGE, allTokens.length);
  const totalPages = Math.ceil(allTokens.length / ITEMS_PER_PAGE);
  
  const selectedTokens = st.selectedTokens || new Set();
  const inactiveCount = st.inactiveAccounts?.length || 0;
  
  const buttons = [];
  
  // Token selection buttons
  for (let i = startIdx; i < endIdx; i++) {
    const token = allTokens[i];
    const isSelected = selectedTokens.has(i);
    const isInactive = i < inactiveCount;
    const emoji = isSelected ? '✅' : '⭕';
    const status = isInactive ? '⏰' : '🟢';
    
    buttons.push([Markup.button.callback(
      `${emoji} ${status} ${token.displayName}`,
      `BURN_TOKEN_${i}`
    )]);
  }
  
  // Navigation buttons
  const navButtons = [];
  if (totalPages > 1) {
    if (page > 0) navButtons.push(Markup.button.callback(t(ctx, 'previous'), 'BURN_TOKEN_PREV'));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback(t(ctx, 'next'), 'BURN_TOKEN_NEXT'));
  }
  if (navButtons.length > 0) buttons.push(navButtons);
  
  // Action buttons
  const actionButtons = [];
  if (selectedTokens.size > 0) {
    const emptyCount = st.emptyAccounts?.length || 0;
    const buttonText = emptyCount > 0 
      ? t(ctx, 'burn_tokens_close_accounts', selectedTokens.size, emptyCount)
      : t(ctx, 'burn_tokens_only', selectedTokens.size);
    actionButtons.push(Markup.button.callback(buttonText, 'BURN_CONFIRM'));
  }
  buttons.push(actionButtons);
  
  // Back button
  buttons.push([Markup.button.callback(t(ctx, 'back_to_consolidation'), 'BURN_BACK_TO_CONSOLIDATION')]);
  
  const message = t(ctx, 'burn_token_selection', 
    page + 1, totalPages, 
    startIdx + 1, endIdx, allTokens.length, 
    selectedTokens.size, 
    inactiveCount, 
    allTokens.length - inactiveCount);
  
  await ctx.replyWithHTML(message, Markup.inlineKeyboard(buttons));
}

// Token selection handlers
bot.action(/TOKEN_(\d+)/, async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const tokenIndex = parseInt(ctx.match[1]);
  const selectedTokens = st.selectedTokens || new Set();
  
  if (selectedTokens.has(tokenIndex)) {
    selectedTokens.delete(tokenIndex);
  } else {
    selectedTokens.add(tokenIndex);
  }
  
  userState.set(ctx.from.id, { ...st, selectedTokens });
  
  await ctx.deleteMessage();
  await showTokenSelection(ctx);
});

bot.action('TOKEN_PREV', async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const page = (st.tokenPage || 0) - 1;
  userState.set(ctx.from.id, { ...st, tokenPage: Math.max(0, page) });
  
  await ctx.deleteMessage();
  await showTokenSelection(ctx);
});

bot.action('TOKEN_NEXT', async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const page = (st.tokenPage || 0) + 1;
  const maxPage = Math.ceil(st.accountsWithBalances.length / 8) - 1;
  userState.set(ctx.from.id, { ...st, tokenPage: Math.min(page, maxPage) });
  
  await ctx.deleteMessage();
  await showTokenSelection(ctx);
});

bot.action('TOKEN_BURN', async ctx => {
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const selectedTokens = Array.from(st.selectedTokens || []);
  await runProcessing(ctx, selectedTokens);
});

bot.action('TOKEN_SKIP', async ctx => {
  await ctx.deleteMessage();
  await runProcessing(ctx, []);
});

// Back navigation handlers
bot.action('TOKEN_BACK_TO_CONSOLIDATION', async ctx => {
  console.log(`⬅️ User ${ctx.from.id} went back to consolidation from token selection`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  await ctx.replyWithHTML(
    t(ctx, 'consolidation_question'),
    Markup.inlineKeyboard([
      Markup.button.callback(t(ctx, 'consolidate_yes'), 'CHOICE_YES'),
      Markup.button.callback(t(ctx, 'consolidate_no'), 'CHOICE_NO')
    ])
  );
});

bot.action('BURN_BACK_TO_CONSOLIDATION', async ctx => {
  console.log(`⬅️ User ${ctx.from.id} went back to consolidation from burn selection`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  if (st.inactiveAccounts?.length > 0) {
    // Show inactive accounts confirmation again
    await ctx.replyWithHTML(
      t(ctx, 'inactive_tokens_simple', st.inactiveAccounts.length, st.inactiveAccounts.length, st.accountsWithBalances?.length || 0, st.emptyAccounts?.length || 0),
      Markup.inlineKeyboard([
        [Markup.button.callback(t(ctx, 'yes_burn_inactive'), 'BURN_INACTIVE_YES')],
        [Markup.button.callback(t(ctx, 'choose_manually'), 'BURN_INACTIVE_MANUAL')],
        [Markup.button.callback(t(ctx, 'skip_inactive'), 'BURN_INACTIVE_SKIP')]
      ])
    );
  } else {
    // Show consolidation choice
    await ctx.replyWithHTML(
      t(ctx, 'consolidation_question_burn'),
      Markup.inlineKeyboard([
        Markup.button.callback(t(ctx, 'consolidate_yes'), 'BURN_CHOICE_YES'),
        Markup.button.callback(t(ctx, 'consolidate_no'), 'BURN_CHOICE_NO')
      ])
    );
  }
});

// Burn-specific token selection handlers
bot.action(/BURN_TOKEN_(\d+)/, async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const tokenIndex = parseInt(ctx.match[1]);
  const selectedTokens = st.selectedTokens || new Set();
  
  if (selectedTokens.has(tokenIndex)) {
    selectedTokens.delete(tokenIndex);
  } else {
    selectedTokens.add(tokenIndex);
  }
  
  userState.set(ctx.from.id, { ...st, selectedTokens });
  
  await ctx.deleteMessage();
  await showBurnTokenSelection(ctx);
});

bot.action('BURN_TOKEN_PREV', async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const page = (st.tokenPage || 0) - 1;
  userState.set(ctx.from.id, { ...st, tokenPage: Math.max(0, page) });
  
  await ctx.deleteMessage();
  await showBurnTokenSelection(ctx);
});

bot.action('BURN_TOKEN_NEXT', async ctx => {
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const allTokens = st.allTokensForSelection || [...(st.inactiveAccounts || []), ...(st.accountsWithBalances || [])];
  const page = (st.tokenPage || 0) + 1;
  const maxPage = Math.ceil(allTokens.length / 8) - 1;
  userState.set(ctx.from.id, { ...st, tokenPage: Math.min(page, maxPage) });
  
  await ctx.deleteMessage();
  await showBurnTokenSelection(ctx);
});

bot.action('BURN_CONFIRM', async ctx => {
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;
  
  const selectedTokens = Array.from(st.selectedTokens || []);
  await runBurnProcessing(ctx, selectedTokens);
});

// Common processing step
async function runProcessing(ctx, selectedTokens = []) {
  console.log(`🚀 Starting processing for user ${ctx.from.id}`);
  const { aesKey, encrypted, payoutAddr, accountsWithBalances, emptyAccounts } = userState.get(ctx.from.id);
  const sentMsg = await ctx.reply(t(ctx, 'processing_request'));
  
  try {
    const keys = JSON.parse(decryptAES(aesKey, encrypted));
    console.log(`🔓 Decrypted ${keys.length} keys for processing`);
    
    let burnedTokens = 0;
    let closedAccounts = 0;
    let lastTxSig = null;
    let reclaimedSol = 0;
    
    let burnedTokenDetails = [];
    
    // Process selected tokens for burning
    let burnTokenFees = 0;
    if (selectedTokens.length > 0) {
      console.log(`🔥 Burning ${selectedTokens.length} selected tokens`);
      // Get selected tokens details for display
      burnedTokenDetails = selectedTokens.map(index => accountsWithBalances[index]);
      const burnResult = await processSelectedTokensWithFees(keys, payoutAddr, selectedTokens, accountsWithBalances, ctx.from.id);
      burnedTokens = burnResult.burnCount;
      burnTokenFees = burnResult.feesCollected || 0;
    }
    
    // Process empty accounts
    let result = { reclaimedSol: 0, feesCollected: 0, netUserAmount: 0 };
    if (emptyAccounts.length > 0) {
      console.log(`🧹 Closing ${emptyAccounts.length} empty accounts`);
      result = await processEmptyAccounts(keys, payoutAddr, emptyAccounts, ctx.from.id);
      closedAccounts = result.closed;
      reclaimedSol = result.reclaimedSol;
      lastTxSig = result.batchTxSig;
    }
    
    // Update referral wallet count
    updateReferralWalletCount(ctx.from.id, keys.length);
    
    // Calculate total SOL reclaimed (using actual amounts from processEmptyAccounts and burn tokens)
    const totalReclaimedSol = result.reclaimedSol || 0;
    const feesCollected = (result.feesCollected || 0) + (burnTokenFees / 1e9); // Convert lamports to SOL
    const netUserAmount = result.netUserAmount || totalReclaimedSol;
    
    // Get USD value if we have SOL to show
    let usdValue = 0;
    let feeUsdValue = 0;
    if (totalReclaimedSol > 0) {
      const solToUsd = await getSolToUsdRate();
      usdValue = netUserAmount * solToUsd; // Net amount user receives
      feeUsdValue = feesCollected * solToUsd;
    }
    
    await ctx.deleteMessage(sentMsg.message_id);
    
    if (burnedTokens === 0 && closedAccounts === 0) {
      await ctx.reply(t(ctx, 'no_actions_taken'));
    } else {
      let message = t(ctx, 'success_header') + '\n\n';
      
      if (burnedTokens > 0) {
        message += t(ctx, 'burned_tokens_header', burnedTokens) + '\n';
        burnedTokenDetails.forEach(token => {
          message += `• ${token.displayName}\n`;
        });
        message += `\n`;
      }
      
      if (closedAccounts > 0) {
        message += t(ctx, 'closed_accounts_msg', closedAccounts) + '\n';
      }
      
      if (totalReclaimedSol > 0) {
        message += t(ctx, 'total_reclaimed', totalReclaimedSol.toFixed(6));
        if (totalReclaimedSol * await getSolToUsdRate() > 0) {
          message += ` (~$${(totalReclaimedSol * await getSolToUsdRate()).toFixed(2)} USD)`;
        }
        message += `\n`;
        
        if (feesCollected > 0) {
          message += t(ctx, 'service_fee', feesCollected.toFixed(6));
          if (feeUsdValue > 0) {
            message += ` (~$${feeUsdValue.toFixed(2)} USD)`;
          }
          message += `\n`;
          message += t(ctx, 'you_receive', netUserAmount.toFixed(6));
          if (usdValue > 0) {
            message += ` (~$${usdValue.toFixed(2)} USD)`;
          }
          message += `\n`;
        }
        
        if (burnedTokens > 0 && closedAccounts > 0) {
          message += `  └ From ${burnedTokens} burned tokens + ${closedAccounts} empty accounts\n`;
        }
      }
      
      message += `\n` + t(ctx, 'cleaned_wallets', keys.length);
      
      // Add referral status message
      const referralInfo = referralUsers.get(ctx.from.id);
      if (referralInfo) {
        const referralConfig = REFERRAL_CODES[referralInfo.referralCode];
        const remainingFreeWallets = Math.max(0, referralConfig.freeWallets - referralInfo.walletCount);
        if (remainingFreeWallets > 0) {
          const walletSuffix = remainingFreeWallets > 1 ? 's' : '';
          message += `\n\n` + t(ctx, 'referral_remaining', referralConfig.name, remainingFreeWallets, walletSuffix);
        } else {
          message += `\n\n` + t(ctx, 'referral_quota_used', referralConfig.name);
        }
      }
      
      if (lastTxSig) {
        message += `\n\n<a href="https://solscan.io/tx/${lastTxSig}">${t(ctx, 'view_on_solscan')}</a>`;
      }
      
      await ctx.replyWithHTML(message, { disable_web_page_preview: true });
      
      // Record stats with actual amounts
      const stats = {
        userId: ctx.from.id,
        username: ctx.from.username || ctx.from.first_name,
        earnedSol: netUserAmount, // Net amount after fees
        grossSol: totalReclaimedSol, // Total before fees
        feesCollected: feesCollected,
        usdValue: usdValue, // Net USD value
        grossUsdValue: totalReclaimedSol * (await getSolToUsdRate()),
        feeUsdValue: feeUsdValue,
        wallets: keys.length,
        burnedTokens,
        closedAccounts,
        burnedTokenDetails: burnedTokenDetails.map(t => ({
          symbol: t.tokenInfo.symbol,
          amount: t.actualBalance,
          displayName: t.displayName
        })),
        referral: referralInfo ? {
          code: referralInfo.referralCode,
          name: REFERRAL_CODES[referralInfo.referralCode]?.name,
          isFeeless: isUserFeeless(ctx.from.id, keys.length),
          totalWalletsProcessed: referralInfo.walletCount + keys.length
        } : null,
        feeRate: FEE_RATE,
        timestamp: new Date().toISOString(),
      };
      await fs.writeFile(
        path.join(STATS_DIR, `${ctx.from.id}.json`),
        JSON.stringify(stats, null, 2)
      );
      console.log(`📊 Stats saved for user ${ctx.from.id}`);
    }
    
  } catch (err) {
    console.error(`❌ Error processing for user ${ctx.from.id}:`, err.message);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
    
    await ctx.deleteMessage(sentMsg.message_id);
    
    let errorMessage = t(ctx, 'error_generic');
    
    if (err.message.includes('Non-native account can only be closed if its balance is zero')) {
      errorMessage = t(ctx, 'error_token_balance');
    } else if (err.message.includes('insufficient')) {
      errorMessage = t(ctx, 'error_insufficient_sol');
    } else if (err.message.includes('Custom program error: 0xb')) {
      errorMessage = t(ctx, 'error_token_cannot_close');
    }
    
    await ctx.reply(errorMessage);
  } finally {
    userState.delete(ctx.from.id);
    console.log(`🧹 Cleaned up state for user ${ctx.from.id}`);
  }
}

// Get SOL to USD conversion rate
async function getSolToUsdRate() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
    
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd', {
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.solana?.usd || 0;
  } catch (error) {
    console.error('Error fetching SOL/USD rate:', error.message);
    return 0; // Return 0 if API fails
  }
}

// Burn-only processing function
async function runBurnProcessing(ctx, selectedTokens = []) {
  console.log(`🔥 Starting burn processing for user ${ctx.from.id}`);
  const st = userState.get(ctx.from.id);
  const { aesKey, encrypted, payoutAddr, accountsWithBalances, inactiveAccounts, emptyAccounts } = st;
  const allTokens = st.allTokensForSelection || [...(inactiveAccounts || []), ...(accountsWithBalances || [])];
  const sentMsg = await ctx.reply(t(ctx, 'processing_burn_cleanup'));
  
  try {
    const keys = JSON.parse(decryptAES(aesKey, encrypted));
    console.log(`🔓 Decrypted ${keys.length} keys for burn processing`);
    
    if (selectedTokens.length === 0) {
      await ctx.deleteMessage(sentMsg.message_id);
      await ctx.reply(t(ctx, 'no_tokens_selected'));
      return;
    }
    
    // Get selected tokens details for display
    const burnedTokenDetails = selectedTokens.map(index => allTokens[index]);
    
    // Process selected tokens for burning
    console.log(`🔥 Burning ${selectedTokens.length} selected tokens`);
    const burnResult = await processSelectedTokensWithFees(keys, payoutAddr, selectedTokens, allTokens, ctx.from.id);
    const burnedTokens = burnResult.burnCount;
    const burnTokenFees = burnResult.feesCollected || 0;
    
    // Process all remaining empty accounts automatically
    let closedEmptyAccounts = 0;
    let emptyAccountsSol = 0;
    let totalFeesCollected = burnTokenFees / 1e9; // Convert lamports to SOL
    if (emptyAccounts && emptyAccounts.length > 0) {
      console.log(`🧹 Automatically processing ${emptyAccounts.length} empty accounts`);
      const emptyResult = await processEmptyAccounts(keys, payoutAddr, emptyAccounts, ctx.from.id);
      closedEmptyAccounts = emptyResult.closed;
      emptyAccountsSol = emptyResult.reclaimedSol;
      totalFeesCollected += (emptyResult.feesCollected || 0);
    }
    
    // Update referral wallet count
    updateReferralWalletCount(ctx.from.id, keys.length);
    
    // Calculate total reclaimed SOL and fees
    const tokenAccountsSol = burnedTokens * 0.00203928; // Approximate rent per token account
    const grossReclaimedSol = tokenAccountsSol + emptyAccountsSol;
    const netUserSol = grossReclaimedSol - totalFeesCollected; // After fees
    
    // Get USD value
    const solToUsd = await getSolToUsdRate();
    const grossUsdValue = grossReclaimedSol * solToUsd;
    const netUsdValue = netUserSol * solToUsd;
    const feeUsdValue = totalFeesCollected * solToUsd;
    
    await ctx.deleteMessage(sentMsg.message_id);
    
    // Build detailed success message
    let message = t(ctx, 'success_header') + '\n\n';
    message += t(ctx, 'burn_selected_processing', burnedTokens + closedEmptyAccounts) + '\n\n';
    
    // Show burned token details
    burnedTokenDetails.forEach(token => {
      message += `• ${token.displayName}\n`;
    });
    
    message += `\n<b>` + t(ctx, 'burn_total_breakdown') + `</b>\n`;
    message += t(ctx, 'total_reclaimed', grossReclaimedSol.toFixed(6));
    if (grossUsdValue > 0) {
      message += ` (~$${grossUsdValue.toFixed(2)} USD)`;
    }
    message += `\n` + t(ctx, 'service_fee', totalFeesCollected.toFixed(6));
    if (feeUsdValue > 0) {
      message += ` (~$${feeUsdValue.toFixed(2)} USD)`;
    }
    message += `\n` + t(ctx, 'you_receive', netUserSol.toFixed(6));
    if (netUsdValue > 0) {
      message += ` (~$${netUsdValue.toFixed(2)} USD)`;
    }
    message += `\n` + t(ctx, 'cleaned_wallets', keys.length) + '\n\n';
    
    if (closedEmptyAccounts > 0) {
      message += t(ctx, 'breakdown_header') + '\n';
      message += t(ctx, 'token_accounts_burned', burnedTokens) + '\n';
      message += t(ctx, 'empty_accounts_closed', closedEmptyAccounts) + '\n';
    }
    
    message += `\n` + t(ctx, 'success_completion') + '\n';
    message += t(ctx, 'no_fees_charged');
    
    // Add referral status message
    const referralInfo = referralUsers.get(ctx.from.id);
    if (referralInfo) {
      const referralConfig = REFERRAL_CODES[referralInfo.referralCode];
      const remainingFreeWallets = Math.max(0, referralConfig.freeWallets - referralInfo.walletCount);
      if (remainingFreeWallets > 0) {
        const walletSuffix = remainingFreeWallets > 1 ? 's' : '';
        message += `\n\n` + t(ctx, 'referral_remaining', referralConfig.name, remainingFreeWallets, walletSuffix);
      } else {
        message += `\n\n` + t(ctx, 'referral_quota_used', referralConfig.name);
      }
    }
    
    await ctx.replyWithHTML(message);
    
    // Record comprehensive burn stats
    const stats = {
      userId: ctx.from.id,
      username: ctx.from.username || ctx.from.first_name,
      earnedSol: netUserSol, // Net amount after fees
      grossSol: grossReclaimedSol, // Total before fees
      feesCollected: totalFeesCollected,
      usdValue: netUsdValue, // Net USD value
      grossUsdValue: grossUsdValue, // Total USD before fees
      feeUsdValue: feeUsdValue,
      wallets: keys.length,
      burnedTokens,
      closedAccounts: burnedTokens + closedEmptyAccounts,
      emptyAccountsClosed: closedEmptyAccounts,
      burnedTokenDetails: burnedTokenDetails.map(t => ({
        symbol: t.tokenInfo.symbol,
        amount: t.actualBalance,
        displayName: t.displayName
      })),
      referral: referralInfo ? {
        code: referralInfo.referralCode,
        name: REFERRAL_CODES[referralInfo.referralCode]?.name,
        isFeeless: isUserFeeless(ctx.from.id, keys.length),
        totalWalletsProcessed: referralInfo.walletCount + keys.length
      } : null,
      burnOnly: true,
      feeRate: FEE_RATE,
      timestamp: new Date().toISOString(),
    };
    await fs.writeFile(
      path.join(STATS_DIR, `${ctx.from.id}_burn_${Date.now()}.json`),
      JSON.stringify(stats, null, 2)
    );
    console.log(`📊 Comprehensive burn stats saved for user ${ctx.from.id}`);
    
  } catch (err) {
    console.error(`❌ Error in burn processing for user ${ctx.from.id}:`, err.message);
    if (err.stack) {
      console.error('Stack trace:', err.stack);
    }
    
    await ctx.deleteMessage(sentMsg.message_id);
    
    let errorMessage = t(ctx, 'error_burn_generic');
    
    if (err.message.includes('insufficient')) {
      errorMessage = t(ctx, 'error_burn_insufficient');
    } else if (err.message.includes('frozen')) {
      errorMessage = t(ctx, 'error_burn_frozen');
    } else if (err.message.includes('Invalid account owner')) {
      errorMessage = t(ctx, 'error_burn_ownership');
    }
    
    await ctx.reply(errorMessage);
  } finally {
    userState.delete(ctx.from.id);
    console.log(`🧹 Cleaned up burn state for user ${ctx.from.id}`);
  }
}

bot.action('BURN_START', async ctx => {
  console.log(`🔥 User ${ctx.from.id} started burn process`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    `🔑 <b>Connect your wallet for burning</b>\n\n` +
    `Send your private key(s), separated by newline, comma, or space.\n\n` +
    `<b>NOTE:</b> Keys are encrypted in-memory and never stored permanently.`,
    { reply_markup: { force_reply: true } }
  );
  userState.set(ctx.from.id, { stage: 'BURN_AWAITING_KEYS' });
});

// Error handling
bot.catch((err, ctx) => {
  console.error('🚨 Bot error:', err.message);
  console.error('Stack:', err.stack);
  console.error('Context:', ctx.update);
});

// Graceful shutdown handling
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error);
  // Don't exit immediately, let the bot try to recover
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, let the bot try to recover
});

bot.launch().then(()=>{
  console.log('🤖 Bot started successfully');
  console.log('📅 Started at:', new Date().toISOString());
  console.log('🔄 Bot will run continuously...');
  console.log('🔄 Auto-restart scheduled every 2 hours');
  
  const startTime = Date.now();
  const RESTART_INTERVAL = 2 * 60 * 60 * 1000; // 2 hours in milliseconds
  
  // Function to perform graceful restart
  const gracefulRestart = (reason = 'Scheduled restart') => {
    console.log(`🔄 ${reason} - shutting down gracefully...`);
    
    // Clear any ongoing operations
    userState.clear();
    
    // Stop the bot
    bot.stop(reason);
    
    // Exit after a short delay to allow cleanup
    setTimeout(() => {
      console.log('✅ Bot shutdown complete. Process manager will restart...');
      process.exit(0);
    }, 3000);
  };
  
  // Schedule automatic restart every 2 hours
  setTimeout(() => {
    const uptime = ((Date.now() - startTime) / 1000 / 60 / 60).toFixed(1);
    gracefulRestart(`Auto-restart after ${uptime} hours`);
  }, RESTART_INTERVAL);
  
  // Monitor memory usage and restart if it gets too high
  setInterval(() => {
    const memUsage = process.memoryUsage();
    const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    
    // Log memory usage every 30 minutes
    if (Date.now() - startTime > 0 && (Date.now() - startTime) % (30 * 60 * 1000) < 60000) {
      console.log(`📊 Memory usage: ${memUsageMB}MB`);
    }
    
    // Restart if memory usage exceeds 500MB
    if (memUsageMB > 500) {
      gracefulRestart(`High memory usage: ${memUsageMB}MB`);
    }
  }, 60000); // Check every minute
  
}).catch((error) => {
  console.error('❌ Failed to start bot:', error);
  
  // Handle specific error types
  if (error.message && error.message.includes('409: Conflict')) {
    console.log('🔄 Telegram bot conflict detected (409 error)');
    console.log('💡 This usually means another bot instance is already running');
    console.log('🔄 Attempting to resolve conflict and restart...');
    
    // Wait a moment and try to stop any existing webhook
    setTimeout(async () => {
      try {
        await bot.telegram.deleteWebhook();
        console.log('🧹 Webhook cleared, retrying launch...');
        
        // Wait a bit more before retrying
        setTimeout(() => {
          console.log('🔄 Retrying bot launch...');
          bot.launch().then(() => {
            console.log('✅ Bot restarted successfully after conflict resolution');
          }).catch((retryError) => {
            console.error('❌ Failed to restart bot after conflict resolution:', retryError);
            process.exit(1);
          });
        }, 5000);
        
      } catch (webhookError) {
        console.error('❌ Failed to clear webhook:', webhookError);
        process.exit(1);
      }
    }, 3000);
    
  } else {
    console.error('❌ Unknown bot launch error:', error);
    process.exit(1);
  }
});