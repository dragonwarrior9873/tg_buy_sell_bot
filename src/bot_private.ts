import assert from 'assert';
import dotenv from 'dotenv';

import { NATIVE_MINT } from '@solana/spl-token';

import * as birdeyeAPI from './birdeyeAPI';
import * as instance from './bot';
import {
    OptionCode,
    StateCode,
} from './bot';
import * as botLogic from './bot_auto_volume_logic';
import * as swap_manager from './swap_manager';
import * as utils from './utils';
import * as Jito from './jitoAPI';
import * as constants from './uniconst';
import { VersionedTransaction } from '@solana/web3.js';
import { getPoolInfo, startBuy, startSell } from './common';
import { Connection } from '@solana/web3.js';

dotenv.config();
const NET_URL =
  process.env.MAINNET_RPC || "https://api.mainnet-beta.solana.com";
export const connection = new Connection(NET_URL, "confirmed");

/*

start - welcome
snipe - snipe setting
wallet - manage your bot wallet
*/

const parseCode = async (database: any, session: any, wholeCode: string) => {
    let codes: string[] = wholeCode.split("_");
    console.log(codes);

    if (codes.length % 2 === 0) {
        for (let i = 0; i < codes.length; i += 2) {
            const type = codes[i];
            const code = codes[i + 1];

            if (type === "ref") {
                if (!session.referredBy) {
                    let referredBy: string = "";

                    referredBy = utils.decodeChatId(code);
                    if (referredBy === "" || referredBy === session.chatid) {
                        continue;
                    }

                    if (referredBy.length > 0) {
                        const refSession = instance.sessions.get(referredBy);
                        if (refSession) {
                            console.log(
                                `${session.username} has been invited by @${refSession.username} (${refSession.chatid})`
                            );
                        }

                        instance.sendInfoMessage(
                            referredBy,
                            `Great news! You have invited @${session.username}
You can earn 1.5% of their earning forever!`
                        );

                        session.referredBy = referredBy;
                        session.referredTimestamp = new Date().getTime();

                        await database.updateUser(session);
                    }
                }
            }
        }
    }
    return false;
};

export const procMessage = async (message: any, database: any) => {
    let chatid = message.chat.id.toString();
    let session = instance.sessions.get(chatid);
    let userName = message?.chat?.username;
    let messageId = message?.messageId;

    if (instance.busy) {
        return
    }

    if (message.photo) {
        console.log(message.photo);
    }

    if (message.animation) {
        console.log(message.animation);
    }

    if (!message.text) return;

    let command = message.text;
    if (message.entities) {
        for (const entity of message.entities) {
            if (entity.type === "bot_command") {
                command = command.substring(
                    entity.offset,
                    entity.offset + entity.length
                );
                break;
            }
        }
    }

    if (command.startsWith("/")) {
        if (!session) {
            if (!userName) {
                console.log(
                    `Rejected anonymous incoming connection. chatid = ${chatid}`
                );
                instance.sendMessage(
                    chatid,
                    `Welcome to ${process.env.BOT_TITLE} bot. We noticed that your telegram does not have a username. Please create username [Setting]->[Username] and try again.`
                );
                return;
            }

            if (false && !(await instance.checkWhitelist(chatid))) {
                //instance.sendMessage(chatid, `😇Sorry, but you do not have permission to use alphBot. If you would like to use this bot, please contact the developer team at ${process.env.TEAM_TELEGRAM}. Thanks!`);
                console.log(
                    `Rejected anonymous incoming connection. @${userName}, ${chatid}`
                );
                return;
            }

            console.log(
                `@${userName} session has been permitted through whitelist`
            );

            session = await instance.createSession(chatid, userName);
            await database.updateUser(session);
        }

        if (userName && session.username !== userName) {
            session.username = userName;
            await database.updateUser(session);
        }

        let params = message.text.split(" ");
        if (params.length > 0 && params[0] === command) {
            params.shift();
        }

        command = command.slice(1);

        if (command === instance.COMMAND_START) {
            let hideWelcome: boolean = false;
            if (params.length == 1 && params[0].trim() !== "") {
                let wholeCode = params[0].trim();
                hideWelcome = await parseCode(database, session, wholeCode);

                await instance.removeMessage(chatid, message.message_id);
            }

            // instance.openMessage(
            //     chatid, "", 0,
            //     `😉 Welcome to ${process.env.BOT_TITLE}, To get quick start, please enter token address.\n Token Registration will take some time.`
            // );

            await instance.executeCommand(chatid, messageId, undefined, {
                c: OptionCode.MAIN_START,                                        
                k: 1,
            })
        }

        // instance.stateMap_remove(chatid)
    } else if (message.reply_to_message) {
        processSettings(message, database);
        await instance.removeMessage(chatid, message.message_id); //TGR
        await instance.removeMessage(
            chatid,
            message.reply_to_message.message_id
        );
    } else if (utils.isValidAddress(command)) {
        console.log(
            `@${userName} session has been permitted through whitelist`
        );

        console.log("=============", session);

        if (!session) {
            session = await instance.createSession(chatid, userName);
            await database.updateUser(session);
        }
        await instance.removeMessage(chatid, messageId)
        const token: any = await database.selectToken({ chatid, addr: command })
        if (token) {
            session.addr = command
            await instance.executeCommand(chatid, messageId, undefined, {
                c: OptionCode.MAIN_MENU,
                k: 1,
            })
        }
        else {
            const token: any = await database.selectToken({ chatid, addr: session.addr })
            if (token && token.status) {
                await instance.removeMessage(chatid, message.message_id)
                instance.openMessage(
                    chatid, "", 0,
                    `⚠️ Warning, Bot is working now. If you need to start with new token, please stop the bot and try again.`
                );
            } else {
                session.addr = command
                instance.executeCommand(chatid, messageId, undefined, {
                    c: OptionCode.MAIN_NEW_TOKEN,
                    k: 1,
                })
            }
        }
    } else {
        instance.openMessage(
            chatid, "", 0,
            `😉 Welcome to ${process.env.BOT_TITLE}, To get quick start, please enter token address.\n Token Registration will take some time.`
        );
    }
};


const processSettings = async (msg: any, database: any) => {
    const sessionId = msg.chat?.id.toString();
    let messageId = msg?.messageId;

    const session = instance.sessions.get(sessionId);
    if (!session) {
        return;
    }

    let stateNode = instance.stateMap_getFocus(sessionId);
    if (!stateNode) {
        instance.stateMap_setFocus(sessionId, StateCode.IDLE, {
            sessionId: sessionId,
        });
        stateNode = instance.stateMap_get(sessionId);

        assert(stateNode);
    }

    const stateData = stateNode.data;

    if (stateNode.state === StateCode.WAIT_WITHDRAW_WALLET_ADDRESS) {
        const addr = msg.text.trim();
        if (!addr || addr === "" || !utils.isValidAddress(addr)) {
            instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the token address you entered is invalid. Please try again`
            );
            return;
        }
        // process wallet withdraw
        await instance.removeMessage(sessionId, messageId)
        const result : boolean = await botLogic.withdraw(sessionId, addr)
        if ( result ){
            await instance.openMessage(session.chatid, "", 0, `✔️ Withdraw is completed successfully.`);
            await instance.removeMessage(sessionId, messageId);
        }
        else {
            await instance.openMessage(session.chatid, "", 0, `⛔ Sorry withdraw is failed.`);
        }
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, messageId, title, menu.options);
        //
    } else if (stateNode.state === StateCode.WAIT_SET_TOKEN) {
        const addr = msg.text.trim();
        if (!addr || addr === "" || !utils.isValidAddress(addr)) {
            instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the token address you entered is invalid. Please try again`
            );
            return;
        }
        // process wallet withdraw
        
        const { exist, symbol, decimal }: any = await utils.getTokenInfo(addr)
        if (!exist) {
            await instance.openMessage(sessionId, "", 0, `❌ Token is invalide. Please try again later.`);
            return;
        }
        const token = await database.selectToken({addr:session.addr})
        console.log( "token is ", token)
  
        let pool_Info;
        //@ts-ignore
        if ( token && token.pool_info ){
            //@ts-ignore
          console.log( "token pool_info is ", token.pool_Info)
          //@ts-ignore
          pool_Info = token.pool_Info
        }
        else {
          pool_Info = await getPoolInfo(connection, session.addr);
        }
        const registered = await botLogic.registerToken(sessionId, addr, symbol, decimal, pool_Info)
        if (registered === constants.ResultCode.SUCCESS) {
            session.addr = addr
            await instance.removeMessage(sessionId, messageId)  
            await instance.openMessage(sessionId, "", 0, `✔️ Token is registered successfully.`);
            await instance.removeMessage(sessionId, messageId)  
            const menu: any = await instance.json_main(sessionId);
            let title: string = await instance.getMainMenuMessage(sessionId);
            // await instance.bot.answerCallbackQuery(stateData.callback_query_id, {
            //     text: `✔️ Token Information successuflly loaded.`,
            // });
            await instance.openMenu(sessionId, undefined, title, menu.options);
        } else {
            await instance.openMessage(sessionId, "", 0, `❌ Token is not registered. Please try again later.`);
        }
    } else if (stateNode.state === StateCode.WAIT_SET_SELL_PERCENT) {
        const amount = Number(msg.text.trim());
        if (isNaN(amount) || amount <= 0) {
            await instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the amount you entered is invalid. Please try again`
            );
            return;
        }
        // process set trx rating
        await instance.removeMessage(sessionId, messageId)
        // await botLogic.sellToken(sessionId, session.addr, amount)
        const result : boolean = await startSell(connection, amount, sessionId, session.addr)
        if ( result ){
            await instance.openMessage(session.chatid, "", 0, `✔️ Selling is completed successfully.`);
        }
        else {
            await instance.openMessage(session.chatid, "", 0, `⛔ Sorry Selling is failed.`);
        }
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, stateData.menu_id, title, menu.options);
        //
    } else if (stateNode.state === StateCode.WAIT_SET_BUY_AMOUNT) {
        const amount = Number(msg.text.trim());
        if (isNaN(amount) || amount <= 0) {
            await instance.openMessage(
                sessionId, "", 0,
                `⛔ Sorry, the amount you entered is invalid. Please try again`
            );
            return;
        }
        // process set buy amount
        await instance.removeMessage(sessionId, messageId)
        // await botLogic.buyToken(sessionId, session.addr, amount)
        const result : boolean = await startBuy(connection,amount, sessionId, session.addr)
        if ( result ){
            await instance.openMessage(session.chatid, "", 0, `✔️ Buying is completed successfully.`);
        }
        else {
            await instance.openMessage(session.chatid, "", 0, `⛔ Sorry Buying is failed.`);
        }
        const menu: any = await instance.json_main(sessionId);
        let title: string = await instance.getMainMenuMessage(sessionId);

        await instance.switchMenu(sessionId, stateData.menu_id, title, menu.options);
        //
    }
};