const bs58 = require("bs58");
const BigNumber = require("bignumber.js");
const BN = require("bn.js");
const { getMint } = require("@solana/spl-token");
const database = require("./db");
const { Market, MARKET_STATE_LAYOUT_V3 } = require("@project-serum/serum");
const {
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getAccount,
} = require("@solana/spl-token");

const axios = require("axios");
const {
  Token,
  TokenAmount,
  TxVersion,
  Liquidity,
  MAINNET_PROGRAM_ID,
  buildSimpleTransaction,
  jsonInfo2PoolKeys,
  poolKeys2JsonInfo,
  SPL_ACCOUNT_LAYOUT,
  LIQUIDITY_STATE_LAYOUT_V4,
} = require("@raydium-io/raydium-sdk");
const { Keypair } = require("@solana/web3.js");

const JITO_TIMEOUT = 60000;

async function getWalletTokenAccount(connection, wallet) {
  const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
    programId: TOKEN_PROGRAM_ID,
  });
  return walletTokenAccount.value.map((i) => ({
    pubkey: i.pubkey,
    programId: i.account.owner,
    accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
  }));
}

async function buildBuyTransaction(
  connection,
  buyer,
  token,
  poolInfo,
  solAmount
) {
  const baseToken = new Token(TOKEN_PROGRAM_ID, token.address, token.decimals);
  const quoteToken = new Token(
    TOKEN_PROGRAM_ID,
    process.env.QUOTE_TOKEN_ADDRESS,
    Number(process.env.QUOTE_TOKEN_DECIMAL),
    process.env.QUOTE_TOKEN_SYMBOL,
    process.env.QUOTE_TOKEN_SYMBOL
  );
  const walletTokenAccount = await getWalletTokenAccount(
    connection,
    buyer
  );
  const buySol = solAmount * LAMPORTS_PER_SOL;
  const quoteAmount = new TokenAmount(quoteToken, buySol);

  const poolKeys = jsonInfo2PoolKeys(poolInfo);
  console.log("Constructing buy Transaction...");

  const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
    connection,
    poolKeys,
    userKeys: {
      tokenAccounts: walletTokenAccount,
      owner: buyer,
    },
    amountIn: quoteAmount,
    amountOut: new TokenAmount(baseToken, 1, false),
    fixedSide: "in",
    makeTxVersion: TxVersion.V0,
  });
  const txns = await buildSimpleTransaction({
    connection: connection,
    makeTxVersion: TxVersion.V0,
    payer: buyer,
    innerTransactions: innerTransactions,
  });
  return txns;
}

async function buildSellTransaction(
  connection,
  seller,
  token,
  poolInfo,
  percent,
  isPercent
) {
  try {
    const associatedToken = getAssociatedTokenAddressSync(
      token.address,
      seller
    );
    const baseToken = new Token(
      TOKEN_PROGRAM_ID,
      token.address,
      token.decimals
    );
    const tokenAccountInfo = await getAccount(connection, associatedToken);
    const zero = new BN(0);
    const tokenBalance = new BN(tokenAccountInfo.amount);
    if (tokenBalance.lte(zero)) {
      console.log("No token balance.");
      return;
    }
    let tenPercent;
    if(isPercent){
      tenPercent = tokenBalance.muln(parseInt(percent) / 100);
    }
    else {
      tenPercent = new BN(parseInt(percent) * ( 10 ** token.decimals) )
    }
    const walletTokenAccount = await getWalletTokenAccount(
      connection,
      seller
    );
    const baseAmount = new TokenAmount(baseToken, tenPercent);
    const quoteToken = new Token(
      TOKEN_PROGRAM_ID,
      "So11111111111111111111111111111111111111112",
      9,
      "WSOL",
      "WSOL"
    );
    const poolKeys = jsonInfo2PoolKeys(poolInfo);
    const minQuoteAmount = new TokenAmount(quoteToken, new BN("1"));
    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
      connection,
      poolKeys,
      userKeys: {
        tokenAccounts: walletTokenAccount,
        owner: seller,
      },
      amountIn: baseAmount,
      amountOut: minQuoteAmount,
      fixedSide: "in",
      makeTxVersion: TxVersion.V0,
    });
    const txns = await buildSimpleTransaction({
      connection: connection,
      makeTxVersion: TxVersion.V0,
      payer: seller,
      innerTransactions: innerTransactions,
    });
    return txns;
  } catch (error) {
    console.log("error :>> ", error);
    return;
  }
}

async function sendBundleConfirmTxId(transaction, txHashs, connection) {
  try {
    if (transaction.length === 0) return false;

    console.log("Sending bundles...", transaction.length);
    let bundleIds = [];
    prev_Balance = [];
    const jito_endpoint = "https://ny.mainnet.block-engine.jito.wtf";
    for (let i = 0; i < transaction.length; i++) {
      const rawTransactions = transaction[i].map((item) =>
        bs58.encode(item.serialize())
      );
      const { data } = await axios.post(
        jito_endpoint + "/api/v1/bundles",
        {
          jsonrpc: "2.0",
          id: 1,
          method: "sendBundle",
          params: [rawTransactions],
        },
        {
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (data) {
        console.log(data);
        bundleIds = [...bundleIds, data.result];
      }
    }

    console.log("Checking bundle's status...", bundleIds);
    const sentTime = Date.now();
    while (Date.now() - sentTime < JITO_TIMEOUT) {
      try {
        let success = true;
        for (let i = 0; i < bundleIds.length; i++) {
          let txResult = await connection.getTransaction(txHashs[i], {
            commitment: "confirmed",
            preflightCommitment: "confirmed",
            maxSupportedTransactionVersion: 1,
          });

          if (txResult === null) {
            success = false;
            break;
          } else {
            console.log("checked", bundleIds[i]);
          }
        }

        if (success) {
          console.log("Success sendBundleConfirmTxId");
          return true;
        }
      } catch (err) {
        console.log(err);
      }

      await sleep(100);
    }
  } catch (err) {
    console.log(err);
  }
  return false;
}

function getJitoTipAccount() {
  const tipAccounts = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh",
    "ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt",
    "DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL",
    "3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT",
  ];
  // Randomly select one of the tip addresses
  const selectedTipAccount =
    tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
  return selectedTipAccount;
}

async function getTipTransaction(connection, ownerPubkey, tip) {
  try {
    const tipAccount = new PublicKey(getJitoTipAccount());
    const instructions = [
      SystemProgram.transfer({
        fromPubkey: ownerPubkey,
        toPubkey: tipAccount,
        lamports: LAMPORTS_PER_SOL * tip,
      }),
    ];
    const recentBlockhash = (await connection.getLatestBlockhash("finalized"))
      .blockhash;
    const messageV0 = new TransactionMessage({
      payerKey: ownerPubkey,
      recentBlockhash,
      instructions,
    }).compileToV0Message();

    return new VersionedTransaction(messageV0);
  } catch (err) {
    console.log(err);
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function getPoolInfo(connection, token) {
  console.log("Getting pool info...", token);

  if (!token) {
    console.log("Invalid token address");
    return {};
  }

  const baseMint = new PublicKey(token);
  const baseMintInfo = await getMint(connection, baseMint);
  const baseToken = new Token(TOKEN_PROGRAM_ID, token, baseMintInfo.decimals);
  const quoteToken = new Token(
    TOKEN_PROGRAM_ID,
    "So11111111111111111111111111111111111111112",
    9,
    "WSOL",
    "WSOL"
  );
  const PROGRAMIDS = MAINNET_PROGRAM_ID;

  //get pool cache

  const options = {
    method: "GET",
    headers: {
      "x-chain": "solana",
      "X-API-KEY": "d38763937c8e4f628d083b1050e94a03",
    },
  };

  const { data } = await (
    await fetch(
      `https://public-api.birdeye.so/defi/v2/markets?address=${token}&sort_by=liquidity&sort_type=desc`,
      options
    )
  ).json();

  if (data.total > 0) {
    for (let i = 0; i < data?.items?.length; i++) {
      const item = data?.items[i];
      if (item.source === "Raydium") {
        const marketAccounts = await connection.getMultipleAccountsInfo([
          new PublicKey(item.address),
        ]);

        const marketInfo1 = marketAccounts.map((v) =>
          LIQUIDITY_STATE_LAYOUT_V4.decode(v.data)
        );
        console.log("marketInfo", marketInfo1[0]);

        const marketInfo = marketAccounts.map((v) =>
          MARKET_STATE_LAYOUT_V3.decode(v.data)
        );

        console.log("marketInfo", marketInfo[0])

        let poolKeys = Liquidity.getAssociatedPoolKeys({
          version: 4,
          marketVersion: 4,
          baseMint: baseToken.mint,
          quoteMint: quoteToken.mint,
          baseDecimals: baseToken.decimals,
          quoteDecimals: quoteToken.decimals,
          marketId: marketInfo1[0].marketId,
          programId: PROGRAMIDS.AmmV4,
          marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
        });
        poolKeys.marketBaseVault = marketInfo[0].baseVault;
        poolKeys.marketQuoteVault = marketInfo[0].quoteVault;
        poolKeys.marketBids = marketInfo[0].bids;
        poolKeys.marketAsks = marketInfo[0].asks;
        poolKeys.marketEventQueue = marketInfo[0].eventQueue;

        return poolKeys2JsonInfo(poolKeys);
      }
    }
  }

  const marketAccounts = await Market.findAccountsByMints(
    connection,
    baseToken.mint,
    quoteToken.mint,
    PROGRAMIDS.OPENBOOK_MARKET
  );
  if (marketAccounts.length === 0) {
    console.log("Not found market info");
    return {};
  }

  const marketInfo = MARKET_STATE_LAYOUT_V3.decode(
    marketAccounts[0].accountInfo.data
  );
  let poolKeys = Liquidity.getAssociatedPoolKeys({
    version: 4,
    marketVersion: 4,
    baseMint: baseToken.mint,
    quoteMint: quoteToken.mint,
    baseDecimals: baseToken.decimals,
    quoteDecimals: quoteToken.decimals,
    marketId: marketAccounts[0].publicKey,
    programId: PROGRAMIDS.AmmV4,
    marketProgramId: PROGRAMIDS.OPENBOOK_MARKET,
  });
  poolKeys.marketBaseVault = marketInfo.baseVault;
  poolKeys.marketQuoteVault = marketInfo.quoteVault;
  poolKeys.marketBids = marketInfo.bids;
  poolKeys.marketAsks = marketInfo.asks;
  poolKeys.marketEventQueue = marketInfo.eventQueue;

  return poolKeys2JsonInfo(poolKeys);
}

async function startBuy(connection, amount, chatid, addr) {
  let verTxns = [];

  const db_token = await database.selectToken({ chatid, addr });
  let poolInfo;
  if (db_token.pool_info) {
    poolInfo = db_token.pool_info;
  } else {
    poolInfo = await getPoolInfo(connection, addr);
  }
  const user = await database.selectUser({ chatid });
  let wallet = Keypair.fromSecretKey(bs58.decode(user.depositWallet));
  const mint = new PublicKey(addr);
  const token = await getMint(connection, mint);

  const txns = await buildBuyTransaction(
    connection,
    wallet.publicKey,
    token,
    poolInfo,
    amount
  );
  for (let tx of txns) {
    if (tx instanceof VersionedTransaction) {
      tx.sign([wallet]);
      verTxns.push(tx);
    }
  }

  const tipTxn = await getTipTransaction(
    connection,
    wallet.publicKey,
    process.env.JITO_TIP
  );
  tipTxn.sign([wallet]);
  verTxns.push(tipTxn);

  const txHash = bs58.encode(tipTxn.signatures[0]);

  console.log("txHash :>> ", txHash);
  return await sendBundleConfirmTxId([verTxns], [txHash], connection);
}

async function startSell(connection, percent, chatid, addr, isPercent) {
  let verTxns = [];
  const db_token = await database.selectToken({ chatid, addr });
  let poolInfo;
  if (db_token.pool_info) {
    poolInfo = db_token.pool_info;
  } else {
    poolInfo = await getPoolInfo(connection, addr);
  }
  const user = await database.selectUser({ chatid });
  let wallet = Keypair.fromSecretKey(bs58.decode(user.depositWallet));
  const mint = new PublicKey(addr);
  const token = await getMint(connection, mint);

  const txns = await buildSellTransaction(
    connection,
    wallet.publicKey,
    token,
    poolInfo,
    percent,
    isPercent
  );
  for (let tx of txns) {
    if (tx instanceof VersionedTransaction) {
      tx.sign([wallet]);
      verTxns.push(tx);
    }
  }

  const tipTxn = await getTipTransaction(
    connection,
    wallet.publicKey,
    process.env.JITO_TIP
  );
  tipTxn.sign([wallet]);
  verTxns.push(tipTxn);

  const txHash = bs58.encode(tipTxn.signatures[0]);

  console.log("txHash :>> ", txHash);
  return await sendBundleConfirmTxId([verTxns], [txHash], connection);
}

async function getPriceImapct5(token) {
  return 0;
}

async function getSolPrice() {
  console.log("getSolPrice");
  const API_KEY = "d38763937c8e4f628d083b1050e94a03";

  //price
  const options = {
    method: "GET",
    headers: {
      "x-chain": "solana",
      "X-API-KEY": API_KEY,
    },
  };

  const { data } = await (
    await fetch(
      `https://public-api.birdeye.so/defi/price?address=So11111111111111111111111111111111111111112`,
      options
    )
  ).json();

  return data?.value;
}

async function getTokenDetailInfo(token) {
  console.log("getTokenDetailInfo");
  const API_KEY = "d38763937c8e4f628d083b1050e94a03";

  //price
  const options = {
    method: "GET",
    headers: {
      "x-chain": "solana",
      "X-API-KEY": API_KEY,
    },
  };

  const { data } = await (
    await fetch(
      `https://public-api.birdeye.so/defi/token_overview?address=${token}`,
      options
    )
  ).json();

  // console.log(data)

  const price = data.price;
  let mc = data.mc;
  if (!mc) {
    mc = price * 10 ** data.decimals
  }
  const priceChange5mPercent = data.priceChange30mPercent;
  const priceChange1hPercent = data.priceChange1hPercent;
  const priceChange6hPercent = data.priceChange6hPercent;
  const priceChange24hPercent = data.priceChange24hPercent;

  console.log(price, mc, priceChange5mPercent, priceChange1hPercent, priceChange6hPercent, priceChange24hPercent);

  const priceImpact = await getPriceImapct5(token);

  return {price, mc, priceChange5mPercent, priceChange1hPercent, priceChange6hPercent, priceChange24hPercent, priceImpact}
}

module.exports = {
  sendBundleConfirmTxId,
  buildBuyTransaction,
  buildSellTransaction,
  getTipTransaction,
  getPoolInfo,
  startBuy,
  startSell,
  getTokenDetailInfo
};
