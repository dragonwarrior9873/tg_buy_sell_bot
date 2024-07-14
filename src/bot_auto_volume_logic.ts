import assert from 'assert';

import { NATIVE_MINT, getMint } from '@solana/spl-token';

import {
    VersionedTransaction,
    PublicKey
} from '@solana/web3.js';

import * as database from './db';
import * as swap_manager from './swap_manager';
import * as swap from './swap';
import * as fastSwap from './fast_swap';
import * as utils from './utils';
import * as constants from './uniconst';
import * as bot from './bot';
import * as global from './global';

import * as Jito from "./jitoAPI"
import { startBuy } from 'common';

// fastSwap.loadPoolKeys()

// const gather = async () => {
//     const wallets: any = await database.selectWallets({})
//     for (let wallet of wallets) {
//         const _wallet: any = utils.getWalletFromPrivateKey(wallet.prvKey)
//         const sol: number = await utils.getWalletSOLBalance(_wallet)
//         if (sol > 0) {
//             console.log("=====sol balance=====", sol)
//             const { trx }: any = await swap.transferSOL(wallet.prvKey, global.get_tax_wallet_address(), sol - 0.0001, () => { }, () => { })
//             await fastSwap.sendVersionedTransaction(trx)
//         }
//     }
// }

// gather()

export const registerToken = async (
    chatid: string, // this value is not filled in case of web request, so this could be 0
    addr: string,
    symbol: string,
    decimal: number,
    pool_info: object,
) => {
    if (await database.selectToken({ chatid, addr })) {
        return constants.ResultCode.SUCCESS
    }
    const regist = await database.registToken({ chatid, addr, symbol, decimal, baseAddr: NATIVE_MINT.toString(),pool_info : pool_info, baseSymbol: "SOL", baseDecimal: 9 })
    if (!regist) {
        return constants.ResultCode.INTERNAL
    }
    return constants.ResultCode.SUCCESS
};

const getRandomAmounts = (amount: number, count: number): number[] => {
    const min: number = amount / (count * 3)
    const max: number = amount / 2
    const randomAmounts: number[] = []

    let total = amount
    for (let i = 0; i < count; i++) {
        const randomSolAmount: number = parseFloat((min + Math.random() * (max - min)).toFixed(5))
        randomAmounts.push(randomSolAmount)
        total -= randomSolAmount
    }
    if (total < 0 || total > amount * 0.95) {
        return getRandomAmounts(amount, count)
    }
    return randomAmounts
}

export const divideToWallets = async (chatid: string) => {
    const session: any = bot.sessions.get(chatid)
    if (!session) {
        return constants.ResultCode.INVALIDE_USER;
    }

    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let depositWalletSOLBalance: number = await utils.getWalletSOLBalance(depositWallet)
    if (depositWalletSOLBalance <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_SOL
    }
    const token: any = await database.selectToken({ chatid, addr: session.addr })
    let tax: number = 1
    if (token.targetVolume % 0.1) {
        tax++
    }
    if (token.workingTime == 0 || await isNeedPayment(chatid, token.addr)) {
        depositWalletSOLBalance -= tax
    }
    if (depositWalletSOLBalance <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL
    }
    if (token.workingTime == 0 || (await utils.getWalletSOLBalance(depositWallet)) - depositWalletSOLBalance < 1) {
        depositWalletSOLBalance -= constants.JITO_FEE_AMOUNT
    }
    if (depositWalletSOLBalance <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_JITO_FEE_SOL
    }
    const divideSolAmount: number = depositWalletSOLBalance / token.walletSize

    if (divideSolAmount <= constants.MIN_DIVIDE_SOL) {
        return constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL
    }

    const randomSolAmounts: number[] = getRandomAmounts(depositWalletSOLBalance, token.walletSize)

    const bundleTransactions: any[] = [];
    const botWallets: any = await database.selectWallets({ chatid })
    for (let i = 0; i < token.walletSize; i++) {
        console.log("-------sol dividing------", divideSolAmount);

        const botWallet: any = utils.getWalletFromPrivateKey(botWallets[i].prvKey)
        const { trx }: any = await swap_manager.transferSOL(database, chatid, depositWallet.secretKey, botWallet.publicKey, randomSolAmounts[i])
        bundleTransactions.push(trx)
    }
    if (bundleTransactions.length <= 4) {
        await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    } else if (bundleTransactions.length > 4) {
        await Jito.createAndSendBundleTransaction(bundleTransactions.slice(0, 4), depositWallet.wallet, constants.JITO_BUNDLE_TIP)
        await Jito.createAndSendBundleTransaction(bundleTransactions.slice(4, bundleTransactions.length), depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    }
}

export const gatherToWallet = async (chatid: string) => {
    const session: any = bot.sessions.get(chatid)
    if (!session) {
        return constants.ResultCode.INVALIDE_USER;
    }

    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    const botWallets: any = await database.selectWallets({ chatid })
    const bundleTransactions: any[] = [];
    for (let wallet of botWallets) {
        const botWallet: any = utils.getWalletFromPrivateKey(wallet.prvKey)
        const botWalletSOLBalance: number = await utils.getWalletSOLBalance(botWallet)
        if (botWalletSOLBalance <= constants.LIMIT_REST_SOL_AMOUNT) {
            continue
        }
        console.log("====================", botWalletSOLBalance);
        const { trx }: any = await swap_manager.transferSOL(database, chatid, botWallet.secretKey, depositWallet.publicKey, botWalletSOLBalance - constants.LIMIT_REST_SOL_AMOUNT)
        bundleTransactions.push(trx)
    }
    console.log("====================", bundleTransactions.length);
    if (bundleTransactions.length <= 4) {
        await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    } else if (bundleTransactions.length > 4) {
        await Jito.createAndSendBundleTransaction(bundleTransactions.slice(0, 4), depositWallet.wallet, constants.JITO_BUNDLE_TIP)
        await Jito.createAndSendBundleTransaction(bundleTransactions.slice(4, bundleTransactions.length), depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    }
    return constants.ResultCode.SUCCESS;
}

const isNeedPayment = async (chatid: string, addr: string) => {
    const whiteLists: any = await database.WhiteList.find({});
    let whiteList: any = null
    for (let ls of whiteLists) {
        if (ls.chatid === chatid) {
            whiteList = ls
        }
    }
    const token: any = await database.selectToken({ chatid, addr })
    if (whiteList) {
        const tokens: any = await database.selectTokens({ chatid })
        let runningBotCount: number = 0
        for (let token of tokens) {
            if (token.currentVolume) {
                runningBotCount++
            }
        }
        if (runningBotCount <= whiteList.limitTokenCount) {
            return false
        } else {
            return true
        }
    }
    return token.currentVolume > token.targetVolume * constants.VOLUME_UNIT ? true : false
}

const catchTax = async (chatid: string, addr: string) => {
    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let depositWalletSOLBalance: number = await utils.getWalletSOLBalance(depositWallet)
    if (depositWalletSOLBalance <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_SOL
    }
    const token: any = await database.selectToken({ chatid, addr })
    // let tax: number = token.targetVolume * constants.SOL_TAX_FEE_PER_1M_VOLUME
    // if (token.targetVolume % 0.1) {
    //     tax++
    // }
    depositWalletSOLBalance -= constants.MIN_TAX_AMOUNT
    if (depositWalletSOLBalance <= 0) {
        return constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL
    }

    const bundleTransactions: any[] = []
    const { trx }: any = await swap_manager.transferSOL(database, chatid, depositWallet.secretKey, global.get_tax_wallet_address(), constants.MIN_TAX_AMOUNT)
    bundleTransactions.push(trx)
    const result: boolean = await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    if (result) {
        console.log("------jito request is successed------");
        return constants.ResultCode.SUCCESS
    } else {
        console.log("------jito request is failed------");
        return constants.ResultCode.INTERNAL
    }
}

const botRun = async (chatid: string, addr: string) => {
    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    const token: any = await database.selectToken({ chatid, addr })

    if (token.status === false) {
        return;
    }

    if (await isNeedPayment(chatid, addr)) {
        stop(chatid, addr)
        await bot.openMessage(chatid, "", 0, "Bot achieved target volume amount")
        return;
    }

    if (await utils.getWalletSOLBalance(depositWallet) < constants.JITO_BUNDLE_TIP) {
        stop(chatid, addr)
        await bot.openMessage(chatid, "", 0, "Deposit wallets is drained. Please charge some sol for Jito fee.")
        return;
    }

    const wallets: any = await database.selectWallets({ chatid })
    try {
        const loadPoolKeys: boolean = await fastSwap.loadPoolKeys_from_market(token.addr, token.decimal, token.baseAddr, token.baseDecimal)

        if (loadPoolKeys) {
            const solPrice = await utils.getSOLPrice()
            let bundleTransactions: any[] = [];
            for (let i = 0; i < token.walletSize; i++) {
                const wallet: any = wallets[i]

                if (token.status === false) {
                    return;
                }

                const payer: any = utils.getWalletFromPrivateKey(wallet.prvKey)
                if (!await utils.IsTokenAccountInWallet(payer, token.addr)) {
                    console.log("----------create token account-----------");

                    const trx: any = await fastSwap.getCreateAccountTransaction(payer, token.addr)
                    bundleTransactions.push(trx)
                }
                if (bundleTransactions.length == 4) {
                    const result: boolean = await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
                    if (result) {
                        console.log("------jito request is successed------");
                    } else {
                        console.log("------jito request is failed------");
                    }
                    bundleTransactions = []
                }
            }
            if (bundleTransactions.length) {
                const result: boolean = await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
                if (result) {
                    console.log("------jito request is successed------");
                } else {
                    console.log("------jito request is failed------");
                }
                bundleTransactions = []
            }

            let volume: number = 0;
            for (let i = 0; i < token.walletSize; i++) {
                const wallet: any = wallets[i]

                if (token.status === false) {
                    return;
                }
                const payer: any = utils.getWalletFromPrivateKey(wallet.prvKey)

                if (!await utils.IsTokenAccountInWallet(payer, token.addr)) {
                    continue
                }

                const pairTokenBalance = await utils.getWalletSOLBalance(
                    payer,
                );
                if (pairTokenBalance < constants.JITO_BUNDLE_TIP) {
                    stop(chatid, addr)
                    await bot.openMessage(chatid, "", 0, "Bot is stopped automatically, because there is not enough sol for jito fee in your deposit wallet.")
                    return;
                }

                if (pairTokenBalance > constants.JITO_BUNDLE_TIP * 2) {
                    const buySolAmount = pairTokenBalance * token.buyAmount / 100
                    console.log("-----------pair balance", buySolAmount);
                    const { trxs: buyTrxs, amount }: any = await fastSwap.getSwapTransaction(payer, token.baseAddr, token.addr, buySolAmount, fastSwap.PoolKeysMap.get(token.addr))
                    bundleTransactions.push(buyTrxs)
                    volume += buySolAmount

                    let tokenBalance: number = await utils.getWalletTokenBalance(
                        payer,
                        token.addr, token.decimal
                    );
                    tokenBalance += parseFloat(amount)
                    console.log("-----------token balance", tokenBalance);
                    if (tokenBalance > 0) {
                        const { trxs: sellTrxs }: any = await fastSwap.getSwapTransaction(payer, token.addr, token.baseAddr, tokenBalance * 0.95, fastSwap.PoolKeysMap.get(token.addr))
                        bundleTransactions.push(sellTrxs)
                        volume += buySolAmount
                    }
                }
                if (bundleTransactions.length == 4 || (token.walletSize - 1) == i) {
                    const result: boolean = await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
                    if (result) {
                        token.currentVolume += volume * solPrice
                        await token.save()
                        console.log("------jito request is successed------");
                    } else {
                        console.log("------jito request is failed------");
                    }
                    volume = 0
                    bundleTransactions = []
                }

            }
        }
    } catch (error) {
        console.log("=========== An Error Occured, Retrying ==========", error)
        // const now: number = new Date().getTime()
        // token.workingTime += (now - token.lastWorkedTime)
        // token.lastWorkedTime = now
        // await token.save()
        // botRun(chatid, addr)
        // return
    }

    const now: number = new Date().getTime()
    token.workingTime += (now - token.lastWorkedTime)
    token.lastWorkedTime = now
    await token.save()
    setTimeout(() => { botRun(chatid, addr) }, constants.MINUTE / token.ratingPer1H)
}


const sellAllTokens = async (chatid: string, addr: string) => {

    const user: any = await database.selectUser({ chatid })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    const token: any = await database.selectToken({ chatid, addr })
    const wallets: any = await database.selectWallets({ chatid })
    const bundleTransactions: any[] = [];
    for (let wallet of wallets) {
        if (!wallet) {
            continue
        }
        const payer: any = utils.getWalletFromPrivateKey(wallet.prvKey)
        const tokenBalance: number = await utils.getWalletTokenBalance(
            payer,
            token.addr, token.decimal
        );
        if (tokenBalance > 0) {
            const { trxs }: any = await fastSwap.getSwapTransaction(payer, token.addr, token.baseAddr, tokenBalance, fastSwap.PoolKeysMap.get(token.addr))
            const trx: VersionedTransaction = trxs
            bundleTransactions.push(trx)
        }
    }
    if (bundleTransactions.length <= 4) {
        await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    } else if (bundleTransactions.length > 4) {
        await Jito.createAndSendBundleTransaction(bundleTransactions.slice(0, 4), depositWallet.wallet, constants.JITO_BUNDLE_TIP)
        await Jito.createAndSendBundleTransaction(bundleTransactions.slice(4, bundleTransactions.length), depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    }
}

export const start = async (
    chatid: string,
    addr: string,
) => {
    assert(chatid);
    assert(addr);

    const token: any = await database.selectToken({ chatid, addr })
    if (!token) {
        return constants.ResultCode.INTERNAL
    }
    if (token.workingTime === 0 || await isNeedPayment(chatid, addr)) {
        const result: any = await catchTax(chatid, addr)
        if (result != constants.ResultCode.SUCCESS) {
            return result
        }
    }
    token.status = true
    token.lastWorkedTime = new Date().getTime()
    botRun(chatid, addr)
    // token.botId = setInterval(() => { botRun(chatid, addr) }, constants.MINUTE / token.ratingPer1H)
    await token.save()
    return constants.ResultCode.SUCCESS
};

// start("6852977408", "6Xnxmhg3GdP7MkCPYjG9v2Hh9NjJmZUEHpf9YjcomxY1")
export const stop = async (chatid: string, addr: string) => {
    assert(addr);

    const token: any = await database.selectToken({ chatid, addr })
    if (!token) {
        return
    }
    await sellAllTokens(chatid, addr)
    token.status = false
    clearInterval(token.botId)
    token.botId = 0
    await token.save()
}

export const withdraw = async (chatid: string, addr: string) => {
    const user: any = await database.selectUser({ chatid })
    if (!user) {
        return false
    }
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    let depositWalletSOLBalance: number = await utils.getWalletSOLBalance(depositWallet)
    if (depositWalletSOLBalance <= 0) {
        return false
    }
    const bundleTransactions: any[] = []

    const session: any = bot.sessions.get(chatid)
    const token: any = await database.selectToken({ chatid, addr: session.addr })
    if (!token) {
        return false
    }
    const { trx }: any = await swap_manager.transferSOL(database, chatid, depositWallet.secretKey, addr, depositWalletSOLBalance - constants.JITO_BUNDLE_TIP - constants.LIMIT_REST_SOL_AMOUNT)
    bundleTransactions.push(trx)
    const result: boolean = await Jito.createAndSendBundleTransaction(bundleTransactions, depositWallet.wallet, constants.JITO_BUNDLE_TIP)
    if (result) {
        console.log("------jito request is successed------");
        return true
    } else {
        console.log("------jito request is failed------");
        return false
    }
}

export const setTargetAmount = async (chatid: string, addr: string, amount: number) => {
    const token: any = await database.selectToken({ chatid, addr })
    token.targetVolume = amount
    await token.save()
    return true
}

// export const sellToken = async (chatid: string, addr: string, amount: number) => {
//     const token: any = await database.selectToken({ chatid, addr })
//     token.ratingPer1H = amount
//     await token.save()
//     return true
// }

// export const buyToken = async (chatid: string, addr: string, amount: number) => {
//     const token: any = await database.selectToken({ chatid, addr })

//     return true
// }

export const setWalletSize = async (chatid: string, addr: string, size: number) => {
    const token: any = await database.selectToken({ chatid, addr })
    token.walletSize = size
    await token.save()
    return true
}
