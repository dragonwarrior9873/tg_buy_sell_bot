const bs58 = require("bs58");
const BigNumber = require("bignumber.js");
const BN = require("bn.js");
const { getMint } = require("@solana/spl-token");
const database = require('./db');
const { Market, MARKET_STATE_LAYOUT_V3 } = require('@project-serum/serum');
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
    SPL_ACCOUNT_LAYOUT
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

async function buildBuyTransaction(connection, buyerOrSeller, token, poolInfo, solAmount) {
    const baseToken = new Token(
        TOKEN_PROGRAM_ID,
        token.address,
        token.decimals
    );
    const quoteToken = new Token(
        TOKEN_PROGRAM_ID,
        process.env.QUOTE_TOKEN_ADDRESS,
        Number(process.env.QUOTE_TOKEN_DECIMAL),
        process.env.QUOTE_TOKEN_SYMBOL,
        process.env.QUOTE_TOKEN_SYMBOL
    );
    const walletTokenAccount = await getWalletTokenAccount(
        connection,
        buyerOrSeller.publicKey
    );
    const buySol = solAmount * LAMPORTS_PER_SOL
    const quoteAmount = new TokenAmount(quoteToken, buySol);

    const poolKeys = jsonInfo2PoolKeys(poolInfo);
    console.log("Constructing buy Transaction...");

    const { innerTransactions } = await Liquidity.makeSwapInstructionSimple({
        connection,
        poolKeys,
        userKeys: {
            tokenAccounts: walletTokenAccount,
            owner: buyerOrSeller.publicKey,
        },
        amountIn: quoteAmount,
        amountOut: new TokenAmount(baseToken, 1, false),
        fixedSide: "in",
        makeTxVersion: TxVersion.V0,
    });
    const txns = await buildSimpleTransaction({
        connection: connection,
        makeTxVersion: TxVersion.V0,
        payer: buyerOrSeller.publicKey,
        innerTransactions: innerTransactions,
    });
    return txns
}

async function buildSellTransaction(connection, buyerOrSeller, token, poolInfo, percent) {
    try {
        const associatedToken = getAssociatedTokenAddressSync(
            token.address,
            buyerOrSeller.publicKey
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
            console.log('No token balance.');
            return
        }
        const tenPercent = tokenBalance.muln(parseInt(percent) / 100);
        const walletTokenAccount = await getWalletTokenAccount(
            connection,
            buyerOrSeller.publicKey
        );
        const baseAmount = new TokenAmount(
            baseToken,
            tenPercent
        );
        const quoteToken = new Token(
            TOKEN_PROGRAM_ID,
            "So11111111111111111111111111111111111111112",
            9,
            "WSOL",
            "WSOL"
        );
        const poolKeys = jsonInfo2PoolKeys(poolInfo);
        const minQuoteAmount = new TokenAmount(quoteToken, new BN("1"));
        const { innerTransactions } =
            await Liquidity.makeSwapInstructionSimple({
                connection,
                poolKeys,
                userKeys: {
                    tokenAccounts: walletTokenAccount,
                    owner: buyerOrSeller.publicKey,
                },
                amountIn: baseAmount,
                amountOut: minQuoteAmount,
                fixedSide: "in",
                makeTxVersion: TxVersion.V0,
            });
        const txns = await buildSimpleTransaction({
            connection: connection,
            makeTxVersion: TxVersion.V0,
            payer: buyerOrSeller.publicKey,
            innerTransactions: innerTransactions,
        });
        return txns
    } catch (error) {
        console.log('error :>> ', error);
        return
    }
}

async function sendBundleConfirmTxId(
    transaction,
    txHashs,
    connection
) {
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
                        commitment: 'confirmed',
                        preflightCommitment: 'confirmed',
                        maxSupportedTransactionVersion: 1
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

async function sendBundleWithAddress(
    transaction,
    bundleTipPayers,
    connection
) {
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
            prev_Balance.push(
                new BN((await connection.getBalance(bundleTipPayers[i])).toString())
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
                    const balance = new BN(
                        (await connection.getBalance(bundleTipPayers[i])).toString()
                    );
                    console.log(balance.toString(), prev_Balance[i].toString());
                    if (balance.eq(prev_Balance[i])) {
                        success = false;
                        break;
                    } else {
                        console.log("checked", bundleIds[i]);
                    }
                }

                if (success) {
                    console.log("Success sendBundlesWithAddress");
                    return true;
                }
            } catch (err) {
                console.log(err);
            }

            await sleep(500);
        }
    } catch (err) {
        console.log(err);
    }
    return false;
}

async function getTipTransaction(connection, ownerPubkey, tip) {
    try {
        const { data } = await axios.post(
            "https://frankfurt.mainnet.block-engine.jito.wtf/api/v1/bundles",
            {
                jsonrpc: "2.0",
                id: 1,
                method: "getTipAccounts",
                params: [],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );
        const tipAddrs = data.result;
        // const getRandomNumber = (min, max) => {
        //     return Math.floor(Math.random() * (max - min + 1)) + min;
        // };
        console.log("Adding tip transactions...", tip);

        const tipAccount = new PublicKey(tipAddrs[0]);
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

    const mint = new PublicKey(token);
    const mintInfo = await getMint(connection, mint);

    const baseToken = new Token(TOKEN_PROGRAM_ID, token, mintInfo.decimals);
    const quoteToken = new Token(TOKEN_PROGRAM_ID, "So11111111111111111111111111111111111111112", 9, "WSOL", "WSOL");

    const PROGRAMIDS = MAINNET_PROGRAM_ID;
    const marketAccounts = await Market.findAccountsByMints(connection, baseToken.mint, quoteToken.mint, PROGRAMIDS.OPENBOOK_MARKET);
    if (marketAccounts.length === 0) {
        console.log("Not found market info");
        return {};
    }

    const marketInfo = MARKET_STATE_LAYOUT_V3.decode(marketAccounts[0].accountInfo.data);
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

    const poolInfo = poolKeys2JsonInfo(poolKeys);
    console.log("poolinfo", poolInfo)
    return poolInfo;
}


async function startBuy(connection, amount, chatid, addr) {
    let verTxns = [];

    const db_token = await database.selectToken({ chatid, addr })
    let poolInfo ;
    if (db_token.pool_info) {
        poolInfo = db_token.pool_info;
    } else {
        poolInfo = await getPoolInfo(connection, addr);
    }
    const user = await database.selectUser({ chatid })
    let wallet = Keypair.fromSecretKey(bs58.decode(user.depositWallet));
    const mint = new PublicKey(addr);
    const token = await getMint(connection, mint);

    const txns = await buildBuyTransaction(
        connection,
        wallet,
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
        process.env.JITO_TIP,
    );
    tipTxn.sign([wallet]);
    verTxns.push(tipTxn);

    const txHash = bs58.encode(tipTxn.signatures[0]);

    console.log("txHash :>> ", txHash);
    return await sendBundleConfirmTxId([verTxns], [txHash], connection);
}

async function startSell(connection, percent, chatid, addr) {
    let verTxns = [];
    const db_token = await database.selectToken({ chatid, addr })
    let poolInfo;
    if (db_token.pool_info) {
        poolInfo = db_token.pool_info;
    } else {
        poolInfo = await getPoolInfo(connection, addr);
    }
    const user = await database.selectUser({ chatid })
    let wallet = Keypair.fromSecretKey(bs58.decode(user.depositWallet));
    const mint = new PublicKey(addr);
    const token = await getMint(connection, mint);

    const txns = await buildSellTransaction(
        connection,
        wallet,
        token,
        poolInfo,
        percent
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
        process.env.JITO_TIP,
    );
    tipTxn.sign([wallet]);
    verTxns.push(tipTxn);

    const txHash = bs58.encode(tipTxn.signatures[0]);

    console.log("txHash :>> ", txHash);
    return await sendBundleConfirmTxId([verTxns], [txHash], connection);
}

module.exports = {
    sendBundleWithAddress,
    sendBundleConfirmTxId,
    buildBuyTransaction,
    buildSellTransaction,
    getTipTransaction,
    getPoolInfo,
    startBuy,
    startSell
};
