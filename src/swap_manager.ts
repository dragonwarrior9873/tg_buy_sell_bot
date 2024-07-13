import dotenv from 'dotenv';

import { sendMessage } from './bot';
import * as afx from './global';
import * as swapBot from './swap';
import * as utils from './utils';

dotenv.config()

export const transferSOL = async (database: any, chatid: string, from: any, to: string, amount: number) => {

    const result = await swapBot.transferSOL(from, to, amount, async (msg: string) => {

        await sendMessage(chatid, msg)

    }, async (swapResult: any) => {

        await database.addTrxHistory({
            chatid: chatid,
            tokenAmount: swapResult.tokenAmount,
            mode: swapResult.mode,
            trxId: swapResult.trxId,
        })
    })
    return result
}


