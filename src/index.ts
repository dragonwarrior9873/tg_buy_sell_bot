import dotenv from 'dotenv';

import { Connection } from '@solana/web3.js';

import * as server from '../server';
import * as bot from './bot';
import * as afx from './global';

dotenv.config()

// const conn: Connection = new Connection(clusterApiUrl(afx.getCluserApiType() as any), "confirmed");
const conn: Connection = new Connection(process.env.MAINNET_RPC as string, "processed");

afx.setWeb3(conn)

bot.init()
bot.sessionInit()

process.on("uncaughtException", async (error) => {
	await bot.bot.stopPolling(); bot.init()
})
process.on("SIGSEGV", async (error) => { await bot.bot.stopPolling(); bot.init() })

// depoDetector.start()
