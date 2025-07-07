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

// Calculate fee amounts and create fee collection instructions
function calculateFeeAndCreateInstructions(totalReclaimedLamports, destinationPubkey) {
  const feeLamports = Math.floor(totalReclaimedLamports * FEE_RATE);
  const userLamports = totalReclaimedLamports - feeLamports;
  
  const instructions = [];
  
  // Only create fee transfer if fee amount is meaningful (> 1000 lamports)
  if (feeLamports > 1000) {
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
    userAmount: userLamports / 1e9 // Convert to SOL
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
    
    return {
      symbol: symbol || (mintAddress.slice(0, 8) + '...'),
      decimals: mint.decimals,
      supply: mint.supply.toString()
    };
  } catch (error) {
    return {
      symbol: mintAddress.slice(0, 8) + '...',
      decimals: 9,
      supply: 'Unknown'
    };
  }
}

// Fetch token symbol from metadata or token list
async function getTokenSymbol(conn, mintAddress) {
  try {
    // Try to fetch from Jupiter token list API (cached)
    const response = await fetch('https://token.jup.ag/strict');
    const tokenList = await response.json();
    
    const token = tokenList.find(t => t.address === mintAddress);
    if (token && token.symbol) {
      return '$' + token.symbol;
    }
    
    // Fallback: check for metadata account
    const [metadataPDA] = PublicKey.findProgramAddressSync(
      [
        Buffer.from('metadata'),
        new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s').toBuffer(),
        new PublicKey(mintAddress).toBuffer(),
      ],
      new PublicKey('metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s')
    );
    
    const accountInfo = await conn.getAccountInfo(metadataPDA);
    if (accountInfo) {
      // Parse metadata (simplified)
      const data = accountInfo.data;
      // Extract symbol from metadata (this is a simplified extraction)
      const symbolStart = data.indexOf(Buffer.from('symbol')) + 6;
      if (symbolStart > 5) {
        const symbolLength = data[symbolStart];
        const symbol = data.slice(symbolStart + 4, symbolStart + 4 + symbolLength).toString();
        return symbol ? '$' + symbol.replace(/\0/g, '') : null;
      }
    }
    
    return null;
  } catch (error) {
    console.error(`Error fetching token symbol for ${mintAddress}:`, error.message);
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
  const closeJobs = [];
  
  // Prepare burn instructions for selected tokens
  for (const tokenIndex of selectedTokens) {
    const token = allTokens[tokenIndex];
    if (token) {
      console.log(`🔥 Will burn: ${token.displayName}`);
      burnJobs.push({
        owner: token.owner,
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
  
  return burnJobs.length;
}

// The core close + reclaim logic for empty accounts
async function processEmptyAccounts(privateKeyStrings, consolidateTo, emptyAccounts) {
  console.log('\n🚀 Processing empty token accounts...');
  
  if (emptyAccounts.length === 0) {
    console.log('ℹ️ No empty accounts to close');
    return { closed: 0, reclaimedSol: 0 };
  }
  
  const conn = new Connection(RPC_URL, 'confirmed');
  const owners = privateKeyStrings.map(s => Keypair.fromSecretKey(bs58.decode(s)));
  const rentDestination = consolidateTo ? new PublicKey(consolidateTo) : owners[0].publicKey;
  
  console.log(`📈 Total empty accounts to close: ${emptyAccounts.length}`);
  
  // Create close instructions
  const jobs = emptyAccounts.map(({ owner, pubkey }) => ({
    owner,
    ix: createCloseAccountInstruction(pubkey, rentDestination, owner.publicKey, [])
  }));
  
  // Batch-close (6 at a time)
  const BATCH = 6;
  let batchTxSig = null;
  
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
  
  // Collect fees from consolidated destination
  const feeDestination = consolidateTo ? new PublicKey(consolidateTo) : owners[0].publicKey;
  const estimatedRentReclaimed = jobs.length * 0.00203928 * 1e9; // Estimated rent in lamports
  
  if (consolidateTo && estimatedRentReclaimed > 1000) {
    const feeCalc = calculateFeeAndCreateInstructions(estimatedRentReclaimed, feeDestination);
    
    if (feeCalc.feeInstructions.length > 0) {
      try {
        console.log(`💲 Collecting ${feeCalc.feeAmount.toFixed(6)} SOL fee (${(FEE_RATE * 100)}%)`);
        
        const { blockhash } = await conn.getLatestBlockhash('confirmed');
        const feeMessage = new TransactionMessage({
          payerKey: FEE_PAYER.publicKey,
          recentBlockhash: blockhash,
          instructions: feeCalc.feeInstructions,
        }).compileToV0Message();
        
        const feeTx = new VersionedTransaction(feeMessage);
        feeTx.sign([FEE_PAYER]);
        
        const feeSig = await conn.sendRawTransaction(feeTx.serialize());
        await confirmByPolling(conn, feeSig);
        
        totalFeesCollected = feeCalc.feeLamports;
        console.log(`✅ Fee collection successful: ${feeSig}`);
      } catch (feeError) {
        console.error('⚠️ Fee collection failed (continuing with operation):', feeError.message);
      }
    }
  }
  
  return {
    closed: jobs.length,
    reclaimedSol: totalReclaimedLamports / 1e9,
    feesCollected: totalFeesCollected / 1e9,
    netUserAmount: (totalReclaimedLamports - totalFeesCollected) / 1e9,
    batchTxSig
  };
}

const bot = new Telegraf(BOT_TOKEN);

// 1) /start
bot.start(async ctx => {
  console.log(`👤 User started bot: ${ctx.from.username || ctx.from.first_name} (ID: ${ctx.from.id})`);
  userState.delete(ctx.from.id);
  const who = ctx.from.username || ctx.from.first_name;
  await ctx.replyWithHTML(
    `👋 <b>Welcome to solbeck, ${who}</b>!\n\n` +
    `💰 <b>What we offer:</b>\n` +
    `• Close empty token accounts & reclaim SOL rent\n` +
    `• Detect inactive token accounts (5+ days)\n` +
    `• Optimize wallet storage automatically\n` +
    `• Safe & secure in-memory processing\n\n` +
    `🎯 <b>Rewards & Fees:</b>\n` +
    `• ~0.002 SOL per closed account\n` +
    `• We take a 10% service fee from reclaimed SOL\n` +
    `• You keep 90% of all reclaimed SOL\n` +
    `• 🎆 We pay ALL transaction fees for you!\n\n` +
    `✨ <b>No SOL needed in your wallets - we cover all gas fees!</b>\n\n` +
    `💻 <b>We're open source!</b> Check out our code at <a href="https://github.com/TheUnknownIndividual/solbeck">GitHub</a>\n\n` +
    `🚀 Choose your action:`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🗯 Continue with Full Cleanup', 'CONTINUE')],
      [Markup.button.callback('🔥 Burn Leftover Tokens', 'BURN_LEFTOVER')]
    ])
  );
});

// 2) CONTINUE → ask for keys
bot.action('CONTINUE', async ctx => {
  console.log(`🔄 User ${ctx.from.id} clicked Continue`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    `👝 <b>Connect your wallet</b>\n\n` +
    `Send your private key(s), separated by newline, comma, or space.\n\n` +
    `🔒 <b>Security:</b> We do NOT store your keys permanently—everything is encrypted in-memory.\n` +
    `🎆 <b>Gas Fees:</b> No SOL needed in your wallets - we pay ALL transaction fees!`,
    { reply_markup: { force_reply: true } }
  );
  userState.set(ctx.from.id, { stage:'AWAITING_KEYS' });
});

// 2b) BURN_LEFTOVER → detailed explanation
bot.action('BURN_LEFTOVER', async ctx => {
  console.log(`🔥 User ${ctx.from.id} clicked Burn Leftover`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    `🔥 <b>Burn Leftover Tokens</b>\n\n` +
    `💡 <b>What this does:</b>\n` +
    `• Scans your wallets for token accounts with balances\n` +
    `• Identifies inactive tokens (no transactions for 5+ days)\n` +
    `• Allows you to permanently burn unwanted tokens\n` +
    `• Closes the accounts to reclaim SOL rent\n\n` +
    `💰 <b>Rewards & Fees:</b>\n` +
    `• ~0.002039 SOL per token account closed\n` +
    `• We take a 10% service fee from reclaimed SOL\n` +
    `• You keep 90% of all reclaimed SOL\n` +
    `• 🎆 We pay ALL transaction fees for you!\n\n` +
    `⚠️ <b>Important:</b>\n` +
    `• Token burning is PERMANENT and irreversible\n` +
    `• Only burn tokens you don't need\n` +
    `• No SOL needed in your wallets for gas fees\n\n` +
    `🔑 Ready to connect your wallet?`,
    Markup.inlineKeyboard([
      [Markup.button.callback('🔥 Start Token Burning', 'BURN_START_FROM_MAIN')],
      [Markup.button.callback('⬅️ Back to Main Menu', 'BACK_TO_START')]
    ])
  );
});

// Back to start handler
bot.action('BACK_TO_START', async ctx => {
  console.log(`⬅️ User ${ctx.from.id} went back to start`);
  userState.delete(ctx.from.id);
  const who = ctx.from.username || ctx.from.first_name;
  await ctx.editMessageText(
    `👋 <b>Welcome to SOL Reclaimer, ${who}</b>!\n\n` +
    `💰 <b>What we offer:</b>\n` +
    `• Close empty token accounts & reclaim SOL rent\n` +
    `• Detect inactive token accounts (5+ days)\n` +
    `• Optimize wallet storage automatically\n` +
    `• Safe & secure in-memory processing\n\n` +
    `🎯 <b>Potential rewards:</b>\n` +
    `• ~0.002 SOL per closed account\n` +
    `• Clean, optimized wallet\n` +
    `• Reduced transaction costs\n\n` +
    `🚀 Choose your action:`,
    {
      parse_mode: 'HTML',
      reply_markup: Markup.inlineKeyboard([
        [Markup.button.callback('🗯 Continue with Full Cleanup', 'CONTINUE')],
        [Markup.button.callback('🔥 Burn Leftover Tokens', 'BURN_LEFTOVER')]
      ]).reply_markup
    }
  );
});

// Start burning from main menu
bot.action('BURN_START_FROM_MAIN', async ctx => {
  console.log(`🔥 User ${ctx.from.id} started burn from main menu`);
  await ctx.deleteMessage();
  await ctx.replyWithHTML(
    `🔑 <b>Connect your wallet for token burning</b>\n\n` +
    `Send your private key(s), separated by newline, comma, or space.\n\n` +
    `🔒 <b>Security:</b> Keys are encrypted in-memory and never stored permanently.\n` +
    `🎆 <b>Gas Fees:</b> No SOL needed in your wallets - we pay ALL transaction fees!`,
    { reply_markup: { force_reply: true } }
  );
  userState.set(ctx.from.id, { stage: 'BURN_AWAITING_KEYS' });
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
      await ctx.reply('❌ Invalid Base58 key detected—please /start again.');
      return userState.delete(ctx.from.id);
    }

    console.log(`✅ All keys valid for user ${ctx.from.id}`);
    const aesKey = genAESKey(),
          encrypted = encryptAES(aesKey, JSON.stringify(parts));
    
    // Scan for tokens first
    const loadingMsg = await ctx.reply('🔍 Scanning your wallets for tokens...');
    
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
          `🪙 <b>Found ${accountsWithBalances.length} token accounts with balances!</b>\n\n` +
          `⚠️ To close these accounts, we need to burn the tokens first.\n` +
          `📋 We also found ${emptyAccounts.length} empty accounts that can be closed immediately.\n\n` +
          `💡 Choose your consolidation preference first:`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Consolidate all SOL', 'CHOICE_YES'),
            Markup.button.callback('❌ Keep SOL in wallets',  'CHOICE_NO')
          ])
        );
      } else if (emptyAccounts.length > 0) {
        await ctx.replyWithHTML(
          `✅ <b>Found ${emptyAccounts.length} empty token accounts!</b>\n\n` +
          `🎉 All can be closed immediately to reclaim SOL rent.\n\n` +
          `💡 Choose your consolidation preference:`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Consolidate all SOL', 'CHOICE_YES'),
            Markup.button.callback('❌ Keep SOL in wallets',  'CHOICE_NO')
          ])
        );
      } else {
        await ctx.reply('ℹ️ No token accounts found to close. Your wallets are already optimized!');
        userState.delete(ctx.from.id);
      }
      
    } catch (error) {
      await ctx.deleteMessage(loadingMsg.message_id);
      console.error(`❌ Error scanning tokens for user ${ctx.from.id}:`, error.message);
      await ctx.reply('❌ Error scanning your wallets. Please try again.');
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
      await ctx.reply('❌ Invalid Solana address—please /start again.');
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
      await ctx.reply('❌ Invalid Base58 key detected—please /burntokens again.');
      return userState.delete(ctx.from.id);
    }

    console.log(`✅ All keys valid for burning for user ${ctx.from.id}`);
    const aesKey = genAESKey(),
          encrypted = encryptAES(aesKey, JSON.stringify(parts));
    
    const loadingMsg = await ctx.reply('🔍 Scanning your wallets for tokens to burn...');
    
    try {
      const { accountsWithBalances, emptyAccounts, inactiveAccounts } = await scanTokenAccounts(parts, true);
      await ctx.deleteMessage(loadingMsg.message_id);
      
      if (accountsWithBalances.length === 0 && inactiveAccounts.length === 0) {
        await ctx.reply('ℹ️ No tokens found to burn. All your token accounts are already empty!');
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
          `⏰ <b>Found ${inactiveAccounts.length} inactive token accounts!</b>\n\n` +
          `📊 <b>Summary:</b>\n` +
          `• Inactive tokens (5+ days): ${inactiveAccounts.length}\n` +
          `• Active tokens: ${accountsWithBalances.length}\n` +
          `• Empty accounts: ${emptyAccounts.length}\n\n` +
          `💡 <b>Inactive tokens are often forgotten tokens that can be safely burned.</b>\n\n` +
          `❓ Would you like to burn all inactive tokens automatically?`,
          Markup.inlineKeyboard([
            [Markup.button.callback('✅ Yes, burn all inactive', 'BURN_INACTIVE_YES')],
            [Markup.button.callback('🔍 Let me choose manually', 'BURN_INACTIVE_MANUAL')],
            [Markup.button.callback('❌ Skip inactive tokens', 'BURN_INACTIVE_SKIP')]
          ])
        );
      } else {
        await ctx.replyWithHTML(
          `🔥 <b>Found ${accountsWithBalances.length} active tokens!</b>\n\n` +
          `No inactive tokens detected. All tokens have recent activity.\n\n` +
          `💡 Choose your consolidation preference for reclaimed SOL:`,
          Markup.inlineKeyboard([
            Markup.button.callback('✅ Consolidate all SOL', 'BURN_CHOICE_YES'),
            Markup.button.callback('❌ Keep SOL in wallets', 'BURN_CHOICE_NO')
          ])
        );
      }
      
    } catch (error) {
      await ctx.deleteMessage(loadingMsg.message_id);
      console.error(`❌ Error scanning tokens for burning for user ${ctx.from.id}:`, error.message);
      await ctx.reply('❌ Error scanning your wallets. Please try again.');
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
      await ctx.reply('❌ Invalid Solana address—please /burntokens again.');
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
    await ctx.reply('📥 Please reply with the SOL address to receive all funds:', {
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
    await ctx.reply('📥 Please reply with the SOL address to receive all funds:', {
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
    `✅ <b>All ${st.inactiveAccounts?.length || 0} inactive tokens selected for burning!</b>\n\n` +
    `💡 Choose your consolidation preference for reclaimed SOL:`,
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Consolidate all SOL', 'BURN_CHOICE_YES'),
      Markup.button.callback('❌ Keep SOL in wallets', 'BURN_CHOICE_NO')
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
    `🔥 <b>Manual Token Selection</b>\n\n` +
    `💡 Choose your consolidation preference first:`,
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Consolidate all SOL', 'BURN_CHOICE_YES'),
      Markup.button.callback('❌ Keep SOL in wallets', 'BURN_CHOICE_NO')
    ])
  );
});

bot.action('BURN_INACTIVE_SKIP', async ctx => {
  console.log(`❌ User ${ctx.from.id} chose to skip inactive tokens`);
  await ctx.deleteMessage();
  const st = userState.get(ctx.from.id);
  if (!st) return;

  if ((st.accountsWithBalances?.length || 0) === 0) {
    await ctx.reply('ℹ️ No active tokens to process. Operation cancelled.');
    return userState.delete(ctx.from.id);
  }

  await ctx.replyWithHTML(
    `🔥 <b>Processing ${st.accountsWithBalances?.length || 0} active tokens only</b>\n\n` +
    `💡 Choose your consolidation preference:`,
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Consolidate all SOL', 'BURN_CHOICE_YES'),
      Markup.button.callback('❌ Keep SOL in wallets', 'BURN_CHOICE_NO')
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
    if (page > 0) navButtons.push(Markup.button.callback('⬅️ Previous', 'TOKEN_PREV'));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback('➡️ Next', 'TOKEN_NEXT'));
  }
  if (navButtons.length > 0) buttons.push(navButtons);
  
  // Action buttons
  const actionButtons = [];
  if (selectedTokens.size > 0) {
    const emptyCount = st.emptyAccounts?.length || 0;
    const buttonText = emptyCount > 0 
      ? `🔥 Burn ${selectedTokens.size} tokens & close ${emptyCount} empty accounts`
      : `🔥 Burn ${selectedTokens.size} tokens`;
    actionButtons.push(Markup.button.callback(buttonText, 'TOKEN_BURN'));
  }
  
  const emptyCount = st.emptyAccounts?.length || 0;
  const skipText = emptyCount > 0 
    ? `✅ Skip burning & close ${emptyCount} empty accounts`
    : '✅ Skip burning';
  actionButtons.push(Markup.button.callback(skipText, 'TOKEN_SKIP'));
  buttons.push(actionButtons);
  
  // Back button
  buttons.push([Markup.button.callback('⬅️ Back to Consolidation', 'TOKEN_BACK_TO_CONSOLIDATION')]);
  
  const message = 
    `🔥 <b>Select tokens to burn</b>\n\n` +
    `📄 Page ${page + 1}/${totalPages}\n` +
    `🔢 Showing ${startIdx + 1}-${endIdx} of ${accountsWithBalances.length} tokens\n` +
    `✅ Selected: ${selectedTokens.size}\n\n` +
    `📊 <b>Summary:</b>\n` +
    `• Tokens with balances: ${accountsWithBalances.length}\n` +
    `• Empty accounts to close: ${emptyCount}\n\n` +
    `⚠️ <b>Warning:</b> Burning tokens is permanent!\n` +
    `💡 Empty accounts will be closed automatically after burning.`;
  
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
    if (page > 0) navButtons.push(Markup.button.callback('⬅️ Previous', 'BURN_TOKEN_PREV'));
    if (page < totalPages - 1) navButtons.push(Markup.button.callback('➡️ Next', 'BURN_TOKEN_NEXT'));
  }
  if (navButtons.length > 0) buttons.push(navButtons);
  
  // Action buttons
  const actionButtons = [];
  if (selectedTokens.size > 0) {
    const emptyCount = st.emptyAccounts?.length || 0;
    const buttonText = emptyCount > 0 
      ? `🔥 Burn ${selectedTokens.size} tokens & close ${emptyCount} empty accounts`
      : `🔥 Burn ${selectedTokens.size} tokens`;
    actionButtons.push(Markup.button.callback(buttonText, 'BURN_CONFIRM'));
  }
  buttons.push(actionButtons);
  
  // Back button
  buttons.push([Markup.button.callback('⬅️ Back to Consolidation', 'BURN_BACK_TO_CONSOLIDATION')]);
  
  const message = 
    `🔥 <b>Select tokens to burn</b>\n\n` +
    `📄 Page ${page + 1}/${totalPages}\n` +
    `🔢 Showing ${startIdx + 1}-${endIdx} of ${allTokens.length} tokens\n` +
    `✅ Selected: ${selectedTokens.size}\n\n` +
    `⏰ Inactive (5+ days): ${inactiveCount}\n` +
    `🟢 Active: ${allTokens.length - inactiveCount}\n\n` +
    `⚠️ <b>Warning:</b> Burning tokens is permanent and irreversible!\n` +
    `💰 Token accounts will be closed and SOL rent will be reclaimed.`;
  
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
    `🤔 <b>Consolidate reclaimed SOL?</b>\n\n` +
    `Send ALL reclaimed SOL into one address, or return each to its original wallet.`,
    Markup.inlineKeyboard([
      Markup.button.callback('✅ Yes', 'CHOICE_YES'),
      Markup.button.callback('❌ No', 'CHOICE_NO')
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
      `⏰ <b>Found ${st.inactiveAccounts.length} inactive token accounts!</b>\n\n` +
      `📊 <b>Summary:</b>\n` +
      `• Inactive tokens (5+ days): ${st.inactiveAccounts.length}\n` +
      `• Active tokens: ${st.accountsWithBalances?.length || 0}\n` +
      `• Empty accounts: ${st.emptyAccounts?.length || 0}\n\n` +
      `💡 <b>Inactive tokens are often forgotten tokens that can be safely burned.</b>\n\n` +
      `❓ Would you like to burn all inactive tokens automatically?`,
      Markup.inlineKeyboard([
        [Markup.button.callback('✅ Yes, burn all inactive', 'BURN_INACTIVE_YES')],
        [Markup.button.callback('🔍 Let me choose manually', 'BURN_INACTIVE_MANUAL')],
        [Markup.button.callback('❌ Skip inactive tokens', 'BURN_INACTIVE_SKIP')]
      ])
    );
  } else {
    // Show consolidation choice
    await ctx.replyWithHTML(
      `💡 Choose your consolidation preference for reclaimed SOL:`,
      Markup.inlineKeyboard([
        Markup.button.callback('✅ Consolidate all SOL', 'BURN_CHOICE_YES'),
        Markup.button.callback('❌ Keep SOL in wallets', 'BURN_CHOICE_NO')
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
  const sentMsg = await ctx.reply('⏳ Processing your request...');
  
  try {
    const keys = JSON.parse(decryptAES(aesKey, encrypted));
    console.log(`🔓 Decrypted ${keys.length} keys for processing`);
    
    let burnedTokens = 0;
    let closedAccounts = 0;
    let reclaimedSol = 0;
    let lastTxSig = null;
    
    // Process selected tokens for burning
    if (selectedTokens.length > 0) {
      console.log(`🔥 Burning ${selectedTokens.length} selected tokens`);
      burnedTokens = await processSelectedTokens(keys, payoutAddr, selectedTokens, accountsWithBalances);
    }
    
    // Process empty accounts
    if (emptyAccounts.length > 0) {
      console.log(`🧹 Closing ${emptyAccounts.length} empty accounts`);
      const result = await processEmptyAccounts(keys, payoutAddr, emptyAccounts);
      closedAccounts = result.closed;
      reclaimedSol = result.reclaimedSol;
      lastTxSig = result.batchTxSig;
    }
    
    await ctx.deleteMessage(sentMsg.message_id);
    
    if (burnedTokens === 0 && closedAccounts === 0) {
      await ctx.reply('ℹ️ No actions were taken. Your wallets are already optimized!');
    } else {
      let message = `✅ <b>Success!</b>\n`;
      if (burnedTokens > 0) message += `🔥 Burned ${burnedTokens} tokens\n`;
      if (closedAccounts > 0) message += `🗂️ Closed ${closedAccounts} empty accounts\n`;
      if (reclaimedSol > 0) message += `💰 Reclaimed ${reclaimedSol.toFixed(6)} SOL\n`;
      
      if (lastTxSig) {
        message += `\n<a href="https://solscan.io/tx/${lastTxSig}">View on Solscan</a>`;
      }
      
      await ctx.replyWithHTML(message, { disable_web_page_preview: true });
      
      // Record stats
      const stats = {
        userId: ctx.from.id,
        username: ctx.from.username || ctx.from.first_name,
        earnedSol: reclaimedSol,
        wallets: keys.length,
        burnedTokens,
        closedAccounts,
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
    
    let errorMessage = 'An error occurred while processing your request.';
    
    if (err.message.includes('Non-native account can only be closed if its balance is zero')) {
      errorMessage = '❌ Some token accounts still have balances. Please select them for burning first.';
    } else if (err.message.includes('insufficient')) {
      errorMessage = '❌ Insufficient SOL for transaction fees.';
    } else if (err.message.includes('Custom program error: 0xb')) {
      errorMessage = '❌ Token account has a balance and cannot be closed. Select it for burning first.';
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
    const response = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
    const data = await response.json();
    return data.solana?.usd || 0;
  } catch (error) {
    console.error('Error fetching SOL/USD rate:', error.message);
    return 0;
  }
}

// Burn-only processing function
async function runBurnProcessing(ctx, selectedTokens = []) {
  console.log(`🔥 Starting burn processing for user ${ctx.from.id}`);
  const st = userState.get(ctx.from.id);
  const { aesKey, encrypted, payoutAddr, accountsWithBalances, inactiveAccounts, emptyAccounts } = st;
  const allTokens = st.allTokensForSelection || [...(inactiveAccounts || []), ...(accountsWithBalances || [])];
  const sentMsg = await ctx.reply('🔥 Processing token burning and cleanup...');
  
  try {
    const keys = JSON.parse(decryptAES(aesKey, encrypted));
    console.log(`🔓 Decrypted ${keys.length} keys for burn processing`);
    
    if (selectedTokens.length === 0) {
      await ctx.deleteMessage(sentMsg.message_id);
      await ctx.reply('❌ No tokens selected for burning.');
      return;
    }
    
    // Get selected tokens details for display
    const burnedTokenDetails = selectedTokens.map(index => allTokens[index]);
    
    // Process selected tokens for burning
    console.log(`🔥 Burning ${selectedTokens.length} selected tokens`);
    const burnedTokens = await processSelectedTokens(keys, payoutAddr, selectedTokens, allTokens);
    
    // Process all remaining empty accounts automatically
    let closedEmptyAccounts = 0;
    let emptyAccountsSol = 0;
    let totalFeesCollected = 0;
    if (emptyAccounts && emptyAccounts.length > 0) {
      console.log(`🧹 Automatically processing ${emptyAccounts.length} empty accounts`);
      const emptyResult = await processEmptyAccounts(keys, payoutAddr, emptyAccounts);
      closedEmptyAccounts = emptyResult.closed;
      emptyAccountsSol = emptyResult.reclaimedSol;
      totalFeesCollected = emptyResult.feesCollected || 0;
    }
    
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
    let message = `✅ <b>Success!</b>\n\n`;
    message += `🔥 We've burnt the unused token(s) you selected successfully, we've closed a total of ${burnedTokens + closedEmptyAccounts} accounts and burnt from the following tokens:\n\n`;
    
    // Show burned token details
    burnedTokenDetails.forEach(token => {
      message += `• ${token.displayName}\n`;
    });
    
    message += `\n<b>The total comes out to:</b>\n`;
    message += `💵 Total Reclaimed: ${grossReclaimedSol.toFixed(6)} SOL`;
    if (grossUsdValue > 0) {
      message += ` (~$${grossUsdValue.toFixed(2)} USD)`;
    }
    message += `\n💲 Service Fee (10%): ${totalFeesCollected.toFixed(6)} SOL`;
    if (feeUsdValue > 0) {
      message += ` (~$${feeUsdValue.toFixed(2)} USD)`;
    }
    message += `\n💰 You Receive: ${netUserSol.toFixed(6)} SOL`;
    if (netUsdValue > 0) {
      message += ` (~$${netUsdValue.toFixed(2)} USD)`;
    }
    message += `\n👛 Wallets: ${keys.length} wallets cleaned up!\n\n`;
    
    if (closedEmptyAccounts > 0) {
      message += `📊 <b>Breakdown:</b>\n`;
      message += `🔥 Token accounts burned: ${burnedTokens}\n`;
      message += `🧹 Empty accounts closed: ${closedEmptyAccounts}\n`;
    }
    
    message += `\n🎉 All accounts have been cleaned and your net SOL has been refunded to your destination address!\n`;
    message += `💳 <b>No transaction fees charged to you - we covered all gas costs!</b>`;
    
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
    
    let errorMessage = '❌ An error occurred while burning tokens.';
    
    if (err.message.includes('insufficient')) {
      errorMessage = '❌ Insufficient SOL for transaction fees.';
    } else if (err.message.includes('frozen')) {
      errorMessage = '❌ Some tokens are frozen and cannot be burned.';
    } else if (err.message.includes('Invalid account owner')) {
      errorMessage = '❌ Invalid account ownership. Please verify your private keys.';
    }
    
    await ctx.reply(errorMessage);
  } finally {
    userState.delete(ctx.from.id);
    console.log(`🧹 Cleaned up burn state for user ${ctx.from.id}`);
  }
}

bot.command('burntokens', async ctx => {
  console.log(`🔥 Burn tokens command requested by user ${ctx.from.id}`);
  userState.delete(ctx.from.id);
  const who = ctx.from.username || ctx.from.first_name;
  await ctx.replyWithHTML(
    `🔥 <b>Token Burning Tool</b>\n\n` +
    `Welcome ${who}! This tool will scan your wallets for tokens and let you burn selected ones.\n\n` +
    `💡 <b>Why burn tokens?</b>\n` +
    `• Close token accounts to reclaim SOL rent\n` +
    `• Clean up your wallet from unwanted tokens\n` +
    `• Optimize your wallet storage\n\n` +
    `⚠️ <b>Warning:</b> Burning tokens is permanent and irreversible!`,
    Markup.inlineKeyboard([Markup.button.callback('🔥 Start Burning', 'BURN_START')])
  );
});

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

bot.command('stats', async ctx => {
  console.log(`📊 Stats requested by user ${ctx.from.id}`);
  try {
    const files = await fs.readdir(STATS_DIR);
    const statsFiles = files.filter(f => f.endsWith('.json'));
    
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
    const solPrice = await getSolToUsdRate();
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
      const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
      const timeAgoText = hoursAgo < 24 ? `${hoursAgo}h ago` : `${Math.floor(hoursAgo / 24)}d ago`;
      
      message += `⏰ <b>Recent Activity</b>\n`;
      message += `• Last Operation: ${timeAgoText}\n`;
      message += `• By: ${stats.mostRecentOperation.username || 'Anonymous'}\n`;
      message += `• Reclaimed: ${(stats.mostRecentOperation.earnedSol || 0).toFixed(6)} SOL\n`;
    }
    
    await ctx.replyWithHTML(message);
    
  } catch (error) {
    console.error('❌ Error getting comprehensive stats:', error.message);
    await ctx.reply('❌ Error retrieving statistics. Please try again later.');
  }
});

// Error handling
bot.catch((err, ctx) => {
  console.error('🚨 Bot error:', err.message);
  console.error('Stack:', err.stack);
  console.error('Context:', ctx.update);
});

bot.launch().then(()=>{
  console.log('🤖 Bot started successfully');
  console.log('📅 Started at:', new Date().toISOString());
});