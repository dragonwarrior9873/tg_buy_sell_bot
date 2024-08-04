import dotenv from "dotenv";
import TelegramBot from "node-telegram-bot-api";

import * as birdeyeAPI from "./birdeyeAPI";
import * as botLogic from "./bot_auto_volume_logic";
import * as privateBot from "./bot_private";
import * as database from "./db";
import * as afx from "./global";
import * as utils from "./utils";
import * as constants from "./uniconst";
import { Connection } from "@solana/web3.js";
import * as instance from "./bot";
import { getPoolInfo, getTokenDetailInfo } from "./common";
import e from "express";

dotenv.config();

export const COMMAND_START = "start";

export enum OptionCode {
  BACK = -100,
  CLOSE,
  TITLE,
  WELCOME = 0,
  MAIN_MENU,
  MAIN_START,
  MAIN_HELP,
  MAIN_NEW_TOKEN,
  MAIN_START_STOP,
  MAIN_SET_TARGET,
  MAIN_SET_SELL_PERCENT,
  MAIN_SET_BUY_AMOUNT,
  MAIN_SET_TOKEN,
  MAIN_WITHDRAW_SOL,
  MAIN_SET_WALLET_SIZE,
  MAIN_DIVIDE_SOL,
  MAIN_GATHER_SOL,
  MAIN_REFRESH,
  START_REFRESH,
  EXPORT_KEY,
  IMPORT_KEY,
  HELP_BACK,
}

export enum StateCode {
  IDLE = 1000,
  WAIT_WITHDRAW_WALLET_ADDRESS,
  WAIT_SET_WALLET_SIZE,
  WAIT_SET_TOKEN_SYMBOL,
  WAIT_SET_TARGET,
  WAIT_SET_SELL_PERCENT,
  WAIT_SET_WALLET,
  WAIT_SET_BUY_AMOUNT,
  WAIT_SET_TOKEN,
}
const NET_URL =
  process.env.MAINNET_RPC || "https://api.mainnet-beta.solana.com";
export const connection = new Connection(NET_URL, "confirmed");

export let bot: TelegramBot;
export let myInfo: TelegramBot.User;
export const sessions = new Map();
export const stateMap = new Map();

export let busy = false;

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
      let msg: TelegramBot.Message = await bot.sendMessage(chatId, menuTitle, {
        reply_markup: keyboard,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

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
      let msg: TelegramBot.Message = await bot.sendMessage(chatId, menuTitle, {
        reply_markup: keyboard,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      });

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

  let token: any = null;
  if (session.addr != "") {
    token = await database.selectToken({
      chatid: sessionId,
      addr: session.addr,
    });
  }
  const user: any = await database.selectUser({ chatid: sessionId });
  const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet);
  const SOLBalance: number = await utils.getWalletSOLBalance(depositWallet);
  let MESSAGE = ""
  if( session.addr ){
    const {price, mc, priceChange5mPercent, priceChange1hPercent, priceChange6hPercent, priceChange24hPercent, priceImpact} = await getTokenDetailInfo(session.addr)

    let tokenBalance: number = 0;
    if (token && token.decimal) {
      tokenBalance = await utils.getWalletTokenBalance(
        depositWallet,
        session.addr,
        token.decimal
      );
    }  
    MESSAGE = `🏅 Welcome to ${process.env.BOT_TITLE} 🏅.
    The fastest Neptune buy and sell bot on Solana.
    To get quick start with token, input your own token to buy and sell tokens.
    🔍 Tap the Help button below for more info.
    
    💡 No fee for <a href="https://nep.ag/">nep.ag</a> customers.
    
    ${
      token
        ? `📜 Token Info: ${token.symbol}/${token.baseSymbol}
      Address <code>${token.addr}</code>`
        : ``
    }
    ${
        price 
        ? `💵 Price: ${price.toFixed(6)} $`:``
    }
    ${
        (priceChange5mPercent 
        ? `5m: ${priceChange5mPercent > 0 ? "+" + priceChange5mPercent.toFixed(3):priceChange5mPercent.toFixed(3)}%  `:``) +  
        (priceChange1hPercent 
        ? `1h: ${priceChange1hPercent > 0 ? "+" + priceChange1hPercent.toFixed(3):priceChange1hPercent.toFixed(3)}%  `:``) +  
        (priceChange6hPercent 
        ? `6h: ${priceChange6hPercent > 0 ? "+" + priceChange6hPercent.toFixed(3):priceChange6hPercent.toFixed(3)}%  `:``) + 
        (priceChange24hPercent 
        ? `24h: ${priceChange24hPercent > 0 ? "+" + priceChange24hPercent.toFixed(3):priceChange24hPercent.toFixed(3)}%  `:``)
    }
    ${
        mc 
        ? `💹 Market Cap: ${price.toFixed(5)} B`:``
    }
    ${
        priceImpact 
        ? `⚡️ Price Impact: ${priceImpact.toFixed(3)} %`:``
    }
    
    💳 Your Deposit Wallet:\n<code>${depositWallet.publicKey}</code>
    💰 Balance: ${utils.roundSolUnit(SOLBalance, 3, "")}
    ${
      token
        ? `💦 Token Balance: ${utils.roundSolUnit(tokenBalance, 3, token.symbol)}`
        : ``
    }
    ${constants.BOT_FOOTER_DASH}`;
    
  }
  else {
    MESSAGE = `🏅 Welcome to ${process.env.BOT_TITLE} 🏅.
    The fastest Neptune buy and sell bot on Solana.
    To get quick start with token, input your own token to buy and sell tokens.
    🔍 Tap the Help button below for more info.
    
    💡 No fee for <a href="https://nep.ag/">nep.ag</a> customers.
    
    💳 Your Deposit Wallet:\n<code>${depositWallet.publicKey}</code>
    💰 Balance: ${utils.roundSolUnit(SOLBalance, 3, "")}
    ${constants.BOT_FOOTER_DASH}`;
    
  }

  return MESSAGE;
};

export const getStartMenuMessage = async (
  sessionId: string
): Promise<string> => {
  const session = sessions.get(sessionId);
  if (!session) {
    return "";
  }

  let token: any = null;
  if (session.addr != "") {
    token = await database.selectToken({
      chatid: sessionId,
      addr: session.addr,
    });
  }
  const user: any = await database.selectUser({ chatid: sessionId });
  const depositWallet: any = utils.getWalletFromPrivateKey(user.depositWallet);
  const SOLBalance: number = await utils.getWalletSOLBalance(depositWallet);
  console.log(SOLBalance);
  const MESSAGE = `🏅 Welcome to ${process.env.BOT_TITLE} 🏅.
The fastest Neptune buy and sell bot on Solana.
To get quick start with token, input your own token to buy and sell tokens.

🔍 Tap the Help button below for more info.

💡 No fee for <a href="https://nep.ag/">nep.ag</a> customers.
💳 Your Deposit Wallet:\n<code>${depositWallet.publicKey}</code>
💰 Balance: ${utils.roundSolUnit(SOLBalance, 3, "")}
${constants.BOT_FOOTER_DASH}`;

  return MESSAGE;
};

export const json_main = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return "";
  }
  const token: any = await database.selectToken({
    chatid: sessionId,
    addr: session.addr,
  });
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
      json_buttonItem(
        itemData,
        OptionCode.MAIN_SET_BUY_AMOUNT,
        `💸 Buy with X SOL`
      ),
      json_buttonItem(
        itemData,
        OptionCode.MAIN_SET_SELL_PERCENT,
        `💸 Sell with X% TOKEN`
      ),
    ],
    [json_buttonItem(itemData, OptionCode.MAIN_WITHDRAW_SOL, "💵 Withdraw")],
    [
      json_buttonItem(itemData, OptionCode.MAIN_REFRESH, "🔄 Refresh"),
      json_buttonItem(itemData, OptionCode.MAIN_HELP, "📖 Help"),
    ],
    [ 
      json_buttonItem(itemData, OptionCode.EXPORT_KEY, "⚡️ Export Key"),
      json_buttonItem(itemData, OptionCode.IMPORT_KEY, "⚡️ Import Key")
    ],
    [json_buttonItem(itemData, OptionCode.CLOSE, "❌ Close")],
  ];
  return { title: "", options: json };
};

export const json_start_main = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return "";
  }
  const token: any = await database.selectToken({
    chatid: sessionId,
    addr: session.addr,
  });
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
      json_buttonItem(itemData, OptionCode.MAIN_SET_TOKEN, `💸 Buy & Sell`),
      json_buttonItem(itemData, OptionCode.MAIN_WITHDRAW_SOL, "💵 Withdraw"),
    ],
    [
      json_buttonItem(itemData, OptionCode.START_REFRESH, "🔄 Refresh"),
      json_buttonItem(itemData, OptionCode.MAIN_HELP, "📖 Help"),
    ],
    [
      json_buttonItem(itemData, OptionCode.EXPORT_KEY, "⚡️ Export Key"),
      json_buttonItem(itemData, OptionCode.IMPORT_KEY, "⚡️ Import Key")
    ],
    [json_buttonItem(itemData, OptionCode.CLOSE, "❌ Close")],
  ];
  return { title: "", options: json };
};

export const json_help = async (sessionId: string) => {
  const session = sessions.get(sessionId);
  if (!session) {
    return null;
  }

  const title = `📕 Help:

This is the first Neptune buy and sell bot on Solana.

🎚️ Bot Settings:
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 
🔹Slippage : Specify the certain slippage 

You can withdraw SOL from deposit wallet

If need more features, cotact here: @bugfly130
${constants.BOT_FOOTER_DASH}`;

  let json = [
    [json_buttonItem(sessionId, OptionCode.HELP_BACK, "Back to Main")],
  ];
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
  username: string
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
      `@${session.username} user${
        session.wallet
          ? " joined"
          : "'s session has been created (" + session.chatid + ")"
      }`
    );
  } else if (session.type === "group") {
    console.log(
      `@${session.username} group${
        session.wallet
          ? " joined"
          : "'s session has been created (" + session.chatid + ")"
      }`
    );
  } else if (session.type === "channel") {
    console.log(
      `@${session.username} channel${
        session.wallet ? " joined" : "'s session has been created"
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
  session.depositWallet = depositWallet?.secretKey;
  // for (let i = 0; i < constants.MAX_WALLET_SIZE; i++) {
  //   console.log("==========Wallet Gen===========");
  //   const botWallet = utils.generateNewWallet();
  // }
  await database.addWallet({
    chatid: session.chatid,
    prvKey: depositWallet?.secretKey,
  });
};

export async function init() {
  busy = true;
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

  bot.on("callback_query", async (callbackQuery: TelegramBot.CallbackQuery) => {
    // console.log('========== callback query ==========')
    // console.log(callbackQuery)
    // console.log('====================================')

    const message = callbackQuery.message;

    if (!message) {
      return;
    }

    const option = JSON.parse(callbackQuery.data as string);
    let chatid = message.chat.id.toString();

    executeCommand(chatid, message.message_id, callbackQuery.id, option);
  });

  // console.log("========bot started========");
  busy = false;
}

export const sessionInit = async () => {
  await database.init();
  const users: any = await database.selectUsers();

  let loggedin = 0;
  for (const user of users) {
    let session = JSON.parse(JSON.stringify(user));
    session = utils.objectDeepCopy(session, ["_id", "__v"]);

    sessions.set(session.chatid, session);

    // const wallets: any = await database.selectWallets({ chatid: user.chatid });
    // if (wallets.length < constants.MAX_WALLET_SIZE) {
    //   for (
    //     let index = wallets.length;
    //     index < constants.MAX_WALLET_SIZE;
    //     index++
    //   ) {
    //     const botWallet = utils.generateNewWallet();
    //     await database.addWallet({
    //       chatid: user.chatid,
    //       prvKey: botWallet?.secretKey,
    //     });
    //   }
    // }
  }

  const tokens: any = await database.selectTokens();
  for (let token of tokens) {
    if (token.status) {
      botLogic.start(token.chatid, token.addr);
      openMessage(
        token.chatid,
        "",
        0,
        "⚠️ Warning, Bot server is restarted just now. Bot continues to make volume..."
      );
    }
  }

  console.log(`${users.length} users, ${loggedin} logged in`);
};

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

  stateData.message_id = messageId;
  stateData.callback_query_id = callbackQueryId;

  try {
    if (cmd === OptionCode.MAIN_NEW_TOKEN) {
      console.log("token address2", session.addr);
      const { exist, symbol, decimal }: any = await utils.getTokenInfo(
        session.addr
      );      
      if (!exist) {
        await openMessage(
          chatid,
          "",
          0,
          `❌ Token is invalide. Please try again later.`
        );
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
      const registered = await botLogic.registerToken(
        chatid,
        session.addr,
        symbol,
        decimal,
        pool_Info
      );
      if (registered === constants.ResultCode.SUCCESS) {
        await removeMessage(chatid, messageId);
        await openMessage(
          chatid,
          "",
          0,
          `✔️ Token is registered successfully.`
        );
        const menu: any = await json_main(chatid);
        let title: string = await getMainMenuMessage(chatid);
        // await instance.bot.answerCallbackQuery(stateData.callback_query_id, {
        //     text: `✔️ Token Information successuflly loaded.`,
        // });
        await openMenu(chatid, cmd, title, menu.options);
      } else {
        await openMessage(
          chatid,
          "",
          0,
          `❌ Token is not registered. Please try again later.`
        );
      }
    } else if (cmd === OptionCode.MAIN_REFRESH) {
      const menu: any = await json_main(sessionId);
      let title: string = await getMainMenuMessage(sessionId);

      switchMenu(chatid, messageId, title, menu.options);
    } else if (cmd === OptionCode.START_REFRESH) {
      const menu: any = await json_start_main(sessionId);
      let title: string = await getStartMenuMessage(sessionId);

      switchMenu(chatid, messageId, title, menu.options);
    } else if (cmd === OptionCode.MAIN_MENU) {
      const menu: any = await json_main(sessionId);
      let title: string = await getMainMenuMessage(sessionId);

      await openMenu(chatid, cmd, title, menu.options);
    } else if (cmd === OptionCode.EXPORT_KEY) {
      const user: any = await database.selectUser({ chatid: sessionId });
      await openMessage(chatid, "", 0, user.depositWallet);
    } else if (cmd === OptionCode.MAIN_START) {
      const menu: any = await json_start_main(sessionId);
      let title: string = await getStartMenuMessage(sessionId);

      await openMenu(chatid, cmd, title, menu.options);
    } 
    else if (cmd === OptionCode.IMPORT_KEY) {
      await sendReplyMessage(
        stateData.sessionId,
        `📨 Reply to this message with the private key of the wallet you want to import.`
      );
      stateData.menu_id = messageId;
      stateMap_setFocus(chatid, StateCode.WAIT_SET_WALLET, stateData);
    } 
    else if (cmd === OptionCode.MAIN_SET_SELL_PERCENT) {
      await sendReplyMessage(
        stateData.sessionId,
        `📨 Reply to this message with percent of Token to sell.\n For example to sell 30% of your tokens: 30`
      );
      stateData.menu_id = messageId;
      stateMap_setFocus(chatid, StateCode.WAIT_SET_SELL_PERCENT, stateData);
    } else if (cmd === OptionCode.MAIN_SET_BUY_AMOUNT) {
      await sendReplyMessage(
        stateData.sessionId,
        `📨 Reply to this message with amount of SOL to use in buying.\n For example to buy with 1.2 sol: 1.2`
      );
      stateData.menu_id = messageId;
      stateMap_setFocus(chatid, StateCode.WAIT_SET_BUY_AMOUNT, stateData);
    } else if (cmd === OptionCode.MAIN_SET_TOKEN) {
      await sendReplyMessage(
        stateData.sessionId,
        `📨 Paste token contract to begin buy & sell ↔️`
      );
      stateData.menu_id = messageId;

      stateMap_setFocus(chatid, StateCode.WAIT_SET_TOKEN, stateData);
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

      await openMenu(chatid, messageId, menu.title, menu.options);
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
