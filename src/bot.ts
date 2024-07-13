import dotenv from 'dotenv';
import TelegramBot from 'node-telegram-bot-api';

import * as birdeyeAPI from './birdeyeAPI';
import * as botLogic from './bot_auto_volume_logic';
import * as privateBot from './bot_private';
import * as database from './db';
import * as afx from './global';
import * as utils from './utils';
import * as constants from './uniconst';

dotenv.config();

export const COMMAND_START = "start";

export enum OptionCode {
    BACK = -100,
    CLOSE,
    TITLE,
    WELCOME = 0,
    MAIN_MENU,
    MAIN_HELP,
    MAIN_NEW_TOKEN,
    MAIN_START_STOP,
    MAIN_SET_TARGET,
    MAIN_SET_RATING,
    MAIN_SET_BUY_AMOUNT,
    MAIN_WITHDRAW_SOL,
    MAIN_SET_WALLET_SIZE,
    MAIN_DIVIDE_SOL,
    MAIN_GATHER_SOL,
    MAIN_REFRESH,

    HELP_BACK
}

export enum StateCode {
    IDLE = 1000,
    WAIT_WITHDRAW_WALLET_ADDRESS,
    WAIT_SET_WALLET_SIZE,
    WAIT_SET_TOKEN_SYMBOL,
    WAIT_SET_TARGET,
    WAIT_SET_RATING,
    WAIT_SET_BUY_AMOUNT,
}

export let bot: TelegramBot;
export let myInfo: TelegramBot.User;
export const sessions = new Map();
export const stateMap = new Map();

export let busy = true

export const stateMap_setFocus = (
    chatid: string,
    state: any,
    data: any = {}
) => {
    let item = stateMap.get(chatid);
    if (!item) {
        item = stateMap_init(chatid);
    }

    if (!data) {
        let focusData = {};
        if (item.focus && item.focus.data) {
            focusData = item.focus.data;
        }

        item.focus = { state, data: focusData };
    } else {
        item.focus = { state, data };
    }

    // stateMap.set(chatid, item)
};

export const stateMap_getFocus = (chatid: string) => {
    const item = stateMap.get(chatid);
    if (item) {
        let focusItem = item.focus;
        return focusItem;
    }

    return null;
};

export const stateMap_init = (chatid: string) => {
    let item = {
        focus: { state: StateCode.IDLE, data: { sessionId: chatid } },
        message: new Map(),
    };

    stateMap.set(chatid, item);

    return item;
};

export const stateMap_setMessage_Id = (
    chatid: string,
    messageType: number,
    messageId: number
) => {
    let item = stateMap.get(chatid);
    if (!item) {
        item = stateMap_init(chatid);
    }

    item.message.set(`t${messageType}`, messageId);
    //stateMap.set(chatid, item)
};

export const stateMap_getMessage = (chatid: string) => {
    const item = stateMap.get(chatid);
    if (item) {
        let messageItem = item.message;
        return messageItem;
    }

    return null;
};

export const stateMap_getMessage_Id = (chatid: string, messageType: number) => {
    const messageItem = stateMap_getMessage(chatid);
    if (messageItem) {
        return messageItem.get(`t${messageType}`);
    }

    return null;
};

export const stateMap_get = (chatid: string) => {
    return stateMap.get(chatid);
};

export const stateMap_remove = (chatid: string) => {
    stateMap.delete(chatid);
};

export const stateMap_clear = () => {
    stateMap.clear();
};

export const json_buttonItem = (key: string, cmd: number, text: string) => {
    return {
        text: text,
        callback_data: JSON.stringify({ k: key, c: cmd }),
    };
};

const json_url_buttonItem = (text: string, url: string) => {
    return {
        text: text,
        url: url,
    };
};

const json_webapp_buttonItem = (text: string, url: any) => {
    return {
        text: text,
        web_app: {
            url,
        },
    };
};

export const removeMenu = async (chatId: string, messageType: number) => {
    const msgId = stateMap_getMessage_Id(chatId, messageType);

    if (msgId) {
        try {
            await bot.deleteMessage(chatId, msgId);
        } catch (error) {
            //afx.errorLog('deleteMessage', error)
        }
    }
};

export const openMenu = async (
    chatId: string,
    messageType: number,
    menuTitle: string,
    json_buttons: any = []
) => {
    const keyboard = {
        inline_keyboard: json_buttons,
        resize_keyboard: false,
        one_time_keyboard: true,
        force_reply: true,
    };

    return new Promise(async (resolve, reject) => {
        await removeMenu(chatId, messageType);

        try {
            let msg: TelegramBot.Message = await bot.sendMessage(
                chatId,
                menuTitle,
                {
                    reply_markup: keyboard,
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                }
            );

            stateMap_setMessage_Id(chatId, messageType, msg.message_id);
            resolve({ messageId: msg.message_id, chatid: msg.chat.id });
        } catch (error) {
            afx.errorLog("openMenu", error);
            resolve(null);
        }
    });
};

export const openMessage = async (
    chatId: string,
    bannerId: string,
    messageType: number,
    menuTitle: string
) => {
    return new Promise(async (resolve, reject) => {
        await removeMenu(chatId, messageType);

        let msg: TelegramBot.Message;

        try {
            if (bannerId) {
                msg = await bot.sendPhoto(chatId, bannerId, {
                    caption: menuTitle,
                    parse_mode: "HTML",
                });
            } else {
                msg = await bot.sendMessage(chatId, menuTitle, {
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                });
            }

            stateMap_setMessage_Id(chatId, messageType, msg.message_id);
            // console.log('chatId, messageType, msg.message_id', chatId, messageType, msg.message_id)
            resolve({ messageId: msg.message_id, chatid: msg.chat.id });
        } catch (error) {
            afx.errorLog("openMenu", error);
            resolve(null);
        }
    });
};

export async function switchMenu(
    chatId: string,
    messageId: number,
    title: string,
    json_buttons: any
) {
    const keyboard = {
        inline_keyboard: json_buttons,
        resize_keyboard: true,
        one_time_keyboard: true,
        force_reply: true,
    };

    try {
        await bot.editMessageText(title, {
            chat_id: chatId,
            message_id: messageId,
            reply_markup: keyboard,
            disable_web_page_preview: true,
            parse_mode: "HTML",
        });
    } catch (error) {
        afx.errorLog("[switchMenuWithTitle]", error);
    }
}

export const replaceMenu = async (
    chatId: string,
    messageId: number,
    messageType: number,
    menuTitle: string,
    json_buttons: any = []
) => {
    const keyboard = {
        inline_keyboard: json_buttons,
        resize_keyboard: true,
        one_time_keyboard: true,
        force_reply: true,
    };

    return new Promise(async (resolve, reject) => {
        try {
            await bot.deleteMessage(chatId, messageId);
        } catch (error) {
            //afx.errorLog('deleteMessage', error)
        }

        await removeMenu(chatId, messageType);

        try {
            let msg: TelegramBot.Message = await bot.sendMessage(
                chatId,
                menuTitle,
                {
                    reply_markup: keyboard,
                    parse_mode: "HTML",
                    disable_web_page_preview: true,
                }
            );

            stateMap_setMessage_Id(chatId, messageType, msg.message_id);
            // console.log('chatId, messageType, msg.message_id', chatId, messageType, msg.message_id)
            resolve({ messageId: msg.message_id, chatid: msg.chat.id });
        } catch (error) {
            afx.errorLog("openMenu", error);
            resolve(null);
        }
    });
};

export const get_menuTitle = (sessionId: string, subTitle: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return "ERROR " + sessionId;
    }

    let result =
        session.type === "private"
            ? `@${session.username}'s configuration setup`
            : `@${session.username} group's configuration setup`;

    if (subTitle && subTitle !== "") {
        //subTitle = subTitle.replace('%username%', `@${session.username}`)
        result += `\n${subTitle}`;
    }

    return result;
};

export const removeMessage = async (sessionId: string, messageId: number) => {
    if (sessionId && messageId) {
        try {
            await bot.deleteMessage(sessionId, messageId);
        } catch (error) {
            //console.error(error)
        }
    }
};

export const sendReplyMessage = async (chatid: string, message: string) => {
    try {
        let data: any = {
            parse_mode: "HTML",
            disable_forward: true,
            disable_web_page_preview: true,
            reply_markup: { force_reply: true },
        };

        const msg = await bot.sendMessage(chatid, message, data);
        return {
            messageId: msg.message_id,
            chatid: msg.chat ? msg.chat.id : null,
        };
    } catch (error) {
        afx.errorLog("sendReplyMessage", error);
        return null;
    }
};

export const sendMessage = async (
    chatid: string,
    message: string,
    info: any = {}
) => {
    try {
        let data: any = { parse_mode: "HTML" };

        data.disable_web_page_preview = true;
        data.disable_forward = true;

        if (info && info.message_thread_id) {
            data.message_thread_id = info.message_thread_id;
        }

        const msg = await bot.sendMessage(chatid, message, data);
        return {
            messageId: msg.message_id,
            chatid: msg.chat ? msg.chat.id : null,
        };
    } catch (error: any) {
        if (
            error.response &&
            error.response.body &&
            error.response.body.error_code === 403
        ) {
            info.blocked = true;
            if (
                error?.response?.body?.description ==
                "Forbidden: bot was blocked by the user"
            ) {
                // database.removeUser({ chatid });
                // sessions.delete(chatid);
            }
        }

        console.log(error?.response?.body);
        afx.errorLog("sendMessage", error);
        return null;
    }
};

export const sendInfoMessage = async (chatid: string, message: string) => {
    let json = [[json_buttonItem(chatid, OptionCode.CLOSE, "✖️ Close")]];

    return sendOptionMessage(chatid, message, json);
};

export const sendOptionMessage = async (
    chatid: string,
    message: string,
    option: any
) => {
    try {
        const keyboard = {
            inline_keyboard: option,
            resize_keyboard: true,
            one_time_keyboard: true,
        };

        const msg = await bot.sendMessage(chatid, message, {
            reply_markup: keyboard,
            disable_web_page_preview: true,
            parse_mode: "HTML",
        });
        return {
            messageId: msg.message_id,
            chatid: msg.chat ? msg.chat.id : null,
        };
    } catch (error) {
        afx.errorLog("sendOptionMessage", error);

        return null;
    }
};

export const pinMessage = (chatid: string, messageId: number) => {
    try {
        bot.pinChatMessage(chatid, messageId);
    } catch (error) {
        console.error(error);
    }
};

export const checkWhitelist = (chatid: string) => {
    return true;
};

export const getMainMenuMessage = async (
    sessionId: string
): Promise<string> => {
    const session = sessions.get(sessionId);
    if (!session) {
        return "";
    }

    let token: any = null
    if (session.addr != "") {
        token = await database.selectToken({ chatid: sessionId, addr: session.addr })
    }
    const user: any = await database.selectUser({ chatid: sessionId })
    const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet)
    const SOLBalance: number = await utils.getWalletSOLBalance(depositWallet)

    const MESSAGE = `🏅 Welcome to ${process.env.BOT_TITLE} 🏅.
The first and only auto volume bot on Solana.
To get quick start with another token, input your own token to make volume.
Tap the Help button below for more info.

💡 No fee for <a href="https://memepump.net/">MemePump</a> customers.

🔍 Deposit SOL Amount Calculation:
    Pool SOL Amount * 0.2

${token ? `📜 Token Info: ${token.symbol}/${token.baseSymbol}
<code>${token.addr}</code>` : ``}

⌛ Bot worked: ${utils.roundDecimal(token.workingTime / constants.MINUTE, 1)} min
💹 Bot made: ${utils.roundBigUnit(token.currentVolume, 2)}

💳 Your Deposit Wallet:\n<code>${depositWallet.publicKey}</code>
💰 Balance: ${utils.roundSolUnit(SOLBalance, 3)}
${constants.BOT_FOOTER_DASH}`

    return MESSAGE;
};

export const json_main = async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return "";
    }

    const token: any = await database.selectToken({ chatid: sessionId, addr: session.addr })
    const itemData = `${sessionId}`;
    const json = [
        [
            json_buttonItem(
                itemData,
                OptionCode.TITLE,
                `🎖️ ${process.env.BOT_TITLE}`
            ),
        ],
        [
            json_buttonItem(itemData, OptionCode.MAIN_START_STOP, token.status ? "⚓ Stop" : "🚀 Start"),
        ],
        [
            json_buttonItem(itemData, OptionCode.MAIN_SET_TARGET, `🎚️ Target Volume Amount (${token.targetVolume}M)`),
        ],
        [
            json_buttonItem(itemData, OptionCode.MAIN_SET_RATING, `♻️ TRX Rating ${token.ratingPer1H}*${token.walletSize}/min`),
            json_buttonItem(itemData, OptionCode.MAIN_SET_BUY_AMOUNT, `💸 Buy with ${token.buyAmount}% SOL`),
        ],
        [
            json_buttonItem(itemData, OptionCode.MAIN_SET_WALLET_SIZE, `🧾 Set Wallet Size (${token.walletSize})`),
            json_buttonItem(itemData, OptionCode.MAIN_DIVIDE_SOL, "🪓 Divide"),
            json_buttonItem(itemData, OptionCode.MAIN_GATHER_SOL, "🧩 Gather"),
        ],
        [
            json_buttonItem(itemData, OptionCode.MAIN_WITHDRAW_SOL, "💵 Withdraw"),
        ],
        [
            json_buttonItem(itemData, OptionCode.MAIN_REFRESH, "🔄 Refresh"),
            json_buttonItem(itemData, OptionCode.MAIN_HELP, "📖 Help"),
        ],
        [
            json_buttonItem(itemData, OptionCode.CLOSE, "❌ Close"),
        ]
    ];

    return { title: "", options: json };
};

export const json_help = async (sessionId: string) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return null;
    }

    const title = `📕 Help:

This bot uses 8 wallets for volume increasing.
You have to deposit some sol to your deposit wallet.

When bot starts working, bot takes tax from deposit wallet.
Tax is 10 * Target Volume Amount SOL

🎚️ Bot Settings:
🔹Target Volume Amount: This spec is amount of volume bot has to achieve. Bot stop automatically when achieves target.
🔹TRX Rating: This spec is transaction count per min.
🔹Set Wallet Size: This spec is size of wallet bot uses.
🔹Buy with SOL: This spec is amount of SOL to buy per transaction.

🔹Divide: This feature is to divide and send needed SOL to bot wallets. 
🔹Gather: This feature is to gather SOL from bot wallets.

You can withdraw SOL from deposit wallet

If need more features, cotact here: @huskar13
${constants.BOT_FOOTER_DASH}`;

    let json = [[json_buttonItem(sessionId, OptionCode.HELP_BACK, "Back to Main")]];
    return { title: title, options: json };
};

export const json_confirm = async (
    sessionId: string,
    msg: string,
    btnCaption: string,
    btnId: number,
    itemData: string = ""
) => {
    const session = sessions.get(sessionId);
    if (!session) {
        return null;
    }

    const title = msg;

    let json = [
        [
            json_buttonItem(sessionId, OptionCode.CLOSE, "Close"),
            json_buttonItem(itemData, btnId, btnCaption),
        ],
    ];
    return { title: title, options: json };
};

export const openConfirmMenu = async (
    sessionId: string,
    msg: string,
    btnCaption: string,
    btnId: number,
    itemData: string = ""
) => {
    const menu: any = await json_confirm(
        sessionId,
        msg,
        btnCaption,
        btnId,
        itemData
    );
    if (menu) {
        await openMenu(sessionId, btnId, menu.title, menu.options);
    }
};

export const createSession = async (
    chatid: string,
    username: string,
    // type: string
) => {
    let session: any = {};

    session.chatid = chatid;
    session.username = username;
    session.addr = "";

    await setDefaultSettings(session);

    sessions.set(session.chatid, session);
    showSessionLog(session);

    return session;
};

export function showSessionLog(session: any) {
    if (session.type === "private") {
        console.log(
            `@${session.username} user${session.wallet
                ? " joined"
                : "'s session has been created (" + session.chatid + ")"
            }`
        );
    } else if (session.type === "group") {
        console.log(
            `@${session.username} group${session.wallet
                ? " joined"
                : "'s session has been created (" + session.chatid + ")"
            }`
        );
    } else if (session.type === "channel") {
        console.log(
            `@${session.username} channel${session.wallet ? " joined" : "'s session has been created"
            }`
        );
    }
}

export const defaultConfig = {
    vip: 0,
};

export const setDefaultSettings = async (session: any) => {
    session.timestamp = new Date().getTime();

    console.log("==========setDefaultSettings===========");

    const depositWallet = utils.generateNewWallet();
    session.depositWallet = depositWallet?.secretKey
    for (let i = 0; i < constants.MAX_WALLET_SIZE; i++) {
        console.log("==========Wallet Gen===========");
        const botWallet = utils.generateNewWallet();
        await database.addWallet({ chatid: session.chatid, prvKey: botWallet?.secretKey })
    }
};


export async function init() {
    busy = true
    bot = new TelegramBot(process.env.BOT_TOKEN as string, {
        polling: true,
    });

    bot.getMe().then((info: TelegramBot.User) => {
        myInfo = info;
    });

    bot.on("message", async (message: any) => {
        // console.log(`========== message ==========`)
        // console.log(message)
        // console.log(`=============================`)

        const msgType = message?.chat?.type;
        if (msgType === "private") {
            privateBot.procMessage(message, database);
        } else if (msgType === "group" || msgType === "supergroup") {
        } else if (msgType === "channel") {
        }
    });

    bot.on(
        "callback_query",
        async (callbackQuery: TelegramBot.CallbackQuery) => {
            // console.log('========== callback query ==========')
            // console.log(callbackQuery)
            // console.log('====================================')

            const message = callbackQuery.message;

            if (!message) {
                return;
            }

            const option = JSON.parse(callbackQuery.data as string);
            let chatid = message.chat.id.toString();

            executeCommand(
                chatid,
                message.message_id,
                callbackQuery.id,
                option
            );
        }
    );

    console.log("========bot started========");
    busy = false
}

export const sessionInit = async () => {
    await database.init();
    const users: any = await database.selectUsers();

    let loggedin = 0;
    for (const user of users) {
        let session = JSON.parse(JSON.stringify(user));
        session = utils.objectDeepCopy(session, ["_id", "__v"]);

        sessions.set(session.chatid, session);

        const wallets: any = await database.selectWallets({ chatid: user.chatid })
        if (wallets.length < constants.MAX_WALLET_SIZE) {
            for (let index = wallets.length; index < constants.MAX_WALLET_SIZE; index++) {
                const botWallet = utils.generateNewWallet();
                await database.addWallet({ chatid: user.chatid, prvKey: botWallet?.secretKey })
            }
        }
    }

    const tokens: any = await database.selectTokens()
    for (let token of tokens) {
        if (token.status) {
            botLogic.start(token.chatid, token.addr)
            openMessage(token.chatid, "", 0, '⚠️ Warning, Bot server is restarted just now. Bot continues to make volume...')
        }
    }

    console.log(
        `${users.length} users, ${loggedin} logged in`
    );
}

export const reloadCommand = async (
    chatid: string,
    messageId: number,
    callbackQueryId: string,
    option: any
) => {
    await removeMessage(chatid, messageId);
    executeCommand(chatid, messageId, callbackQueryId, option);
};

export const executeCommand = async (
    chatid: string,
    _messageId: number | undefined,
    _callbackQueryId: string | undefined,
    option: any
) => {
    const cmd = option.c;
    const id = option.k;

    const session = sessions.get(chatid);
    if (!session) {
        return;
    }

    //stateMap_clear();

    let messageId = Number(_messageId ?? 0);
    let callbackQueryId = _callbackQueryId ?? "";

    const sessionId: string = chatid;
    const stateData: any = { sessionId, messageId, callbackQueryId, cmd };

    stateData.message_id = messageId
    stateData.callback_query_id = callbackQueryId

    try {
        if (cmd === OptionCode.MAIN_NEW_TOKEN) {

            const { exist, symbol, decimal }: any = await utils.getTokenInfo(session.addr)
            if (!exist) {
                await openMessage(chatid, "", 0, `❌ Token is invalide. Please try again later.`);
                return;
            }
            const registered = await botLogic.registerToken(chatid, session.addr, symbol, decimal)
            if (registered === constants.ResultCode.SUCCESS) {
                await removeMessage(chatid, messageId)
                await openMessage(chatid, "", 0, `✔️ Token is registered successfully.`);
                const menu: any = await json_main(chatid);
                let title: string = await getMainMenuMessage(chatid);

                await openMenu(chatid, cmd, title, menu.options);
            } else {
                await openMessage(chatid, "", 0, `❌ Token is not registered. Please try again later.`);
            }
        } else if (cmd === OptionCode.MAIN_REFRESH) {
            const menu: any = await json_main(sessionId);
            let title: string = await getMainMenuMessage(sessionId);

            switchMenu(chatid, messageId, title, menu.options);
        } else if (cmd === OptionCode.MAIN_MENU) {
            const menu: any = await json_main(sessionId);
            let title: string = await getMainMenuMessage(sessionId);

            await openMenu(chatid, cmd, title, menu.options);
        } else if (cmd === OptionCode.MAIN_START_STOP) {
            bot.answerCallbackQuery(callbackQueryId, {
                text: `⏱️ Please wait a sec...`,
            });
            // bot start or stop
            const token: any = await database.selectToken({ chatid, addr: session.addr })
            if (token.status) {
                const result = await botLogic.stop(chatid, session.addr)
            } else {
                const result = await botLogic.start(chatid, session.addr)
                switch (result) {
                    case constants.ResultCode.USER_INSUFFICIENT_SOL:
                        openMessage(
                            chatid, "", 0,
                            `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                        );
                        break;
                    case constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL:
                        openMessage(
                            chatid, "", 0,
                            `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                        );
                        break;
                    case constants.ResultCode.USER_INSUFFICIENT_JITO_FEE_SOL:
                        openMessage(
                            chatid, "", 0,
                            `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                        );
                        break;
                    case constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL:
                        openMessage(
                            chatid, "", 0,
                            `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                        );
                        break;
                    default:
                        break;
                }
            }
            //
            const menu: any = await json_main(sessionId);
            let title: string = await getMainMenuMessage(sessionId);

            await switchMenu(chatid, messageId, title, menu.options);
        } else if (cmd === OptionCode.MAIN_SET_TARGET) {
            await sendReplyMessage(
                stateData.sessionId,
                `📨 Reply to this message with amount of volume to make.\nMin: 0.1`
            );
            stateData.menu_id = messageId
            stateMap_setFocus(
                chatid,
                StateCode.WAIT_SET_TARGET,
                stateData
            );
        } else if (cmd === OptionCode.MAIN_SET_RATING) {
            await sendReplyMessage(
                stateData.sessionId,
                `📨 Reply to this message with value of rating to set.\nFor example: 2 or 5`
            );
            stateData.menu_id = messageId
            stateMap_setFocus(
                chatid,
                StateCode.WAIT_SET_RATING,
                stateData
            );
        } else if (cmd === OptionCode.MAIN_SET_WALLET_SIZE) {
            await sendReplyMessage(
                stateData.sessionId,
                `📨 Reply to this message with wallet size to use.\nMin: 1, Max: 8`
            );
            stateData.menu_id = messageId
            stateMap_setFocus(
                chatid,
                StateCode.WAIT_SET_WALLET_SIZE,
                stateData
            );
        } else if (cmd === OptionCode.MAIN_SET_BUY_AMOUNT) {
            await sendReplyMessage(
                stateData.sessionId,
                `📨 Reply to this message with amount of SOL to use in buying.\nMin: 5, Max: 95`
            );
            stateData.menu_id = messageId
            stateMap_setFocus(
                chatid,
                StateCode.WAIT_SET_BUY_AMOUNT,
                stateData
            );
        } else if (cmd === OptionCode.MAIN_WITHDRAW_SOL) {
            await sendReplyMessage(
                stateData.sessionId,
                `📨 Reply to this message with your phantom wallet address to withdraw.`
            );
            stateMap_setFocus(
                chatid,
                StateCode.WAIT_WITHDRAW_WALLET_ADDRESS,
                stateData
            );
        } else if (cmd === OptionCode.MAIN_DIVIDE_SOL) {
            bot.answerCallbackQuery(callbackQueryId, {
                text: `⏱️ Please wait a sec...`,
            });
            // divide to wallets
            const result = await botLogic.divideToWallets(chatid)
            switch (result) {
                case constants.ResultCode.USER_INSUFFICIENT_SOL:
                    openMessage(
                        chatid, "", 0,
                        `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                    );
                    return;
                case constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL:
                    openMessage(
                        chatid, "", 0,
                        `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                    );
                    return;
                case constants.ResultCode.USER_INSUFFICIENT_JITO_FEE_SOL:
                    openMessage(
                        chatid, "", 0,
                        `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                    );
                    return;
                case constants.ResultCode.USER_INSUFFICIENT_ENOUGH_SOL:
                    openMessage(
                        chatid, "", 0,
                        `😢 Sorry, There is not enough sol in deposit wallet. please deposit enough sol to start and try again.`
                    );
                    return;
                default:
                    break;
            }
            const menu: any = await json_main(sessionId);
            let title: string = await getMainMenuMessage(sessionId);

            await switchMenu(chatid, messageId, title, menu.options);
            //
        } else if (cmd === OptionCode.MAIN_GATHER_SOL) {
            bot.answerCallbackQuery(callbackQueryId, {
                text: `⏱️ Please wait a sec...`,
            });
            // gather from wallets
            await botLogic.gatherToWallet(chatid)
            const menu: any = await json_main(sessionId);
            let title: string = await getMainMenuMessage(sessionId);

            await switchMenu(chatid, messageId, title, menu.options);
            //
        } else if (cmd === OptionCode.HELP_BACK) {
            await removeMessage(sessionId, messageId);
            const menu: any = await json_main(sessionId);
            let title: string = await getMainMenuMessage(sessionId);

            await openMenu(chatid, cmd, title, menu.options);
        } else if (cmd === OptionCode.CLOSE) {
            await removeMessage(sessionId, messageId);
        } else if (cmd === OptionCode.MAIN_HELP) {
            await removeMessage(sessionId, messageId);
            const menu: any = await json_help(sessionId);

            await openMenu(
                chatid,
                messageId,
                menu.title,
                menu.options
            );
        }
    } catch (error) {
        console.log(error);
        sendMessage(
            chatid,
            `😢 Sorry, Bot server restarted. Please try again with input token address 😉`
        );
        if (callbackQueryId)
            await bot.answerCallbackQuery(callbackQueryId, {
                text: `😢 Sorry, Bot server restarted. Please try again with input token address 😉`,
            });
    }
};
