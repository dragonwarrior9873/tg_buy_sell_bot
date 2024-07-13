import { searcherClient } from "jito-ts/dist/sdk/block-engine/searcher";
import * as global from "./global";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { Bundle } from "jito-ts/dist/sdk/block-engine/types.js";
import * as constants from "./uniconst"
import * as utils from "./utils"
import base58 from "bs58";

const getAPIKeyIndex = () => {
	const index = Math.floor((constants.JITO_AUTH_KEYS.length - 1) * Math.random())
	console.log("-------key index-------", index);
	return index
}

export const createAndSendBundleTransaction = async (bundleTransactions: any, payer: any, fee: number) => {
	const wallet = utils.getWalletFromPrivateKey(constants.JITO_AUTH_KEYS[getAPIKeyIndex()])
	const searcher = searcherClient(
		global.get_jito_block_api(),
		wallet.wallet
	);
	const _tipAccount = (await searcher.getTipAccounts())[0];
	const tipAccount = new PublicKey(_tipAccount);

	let transactionsConfirmResult: boolean = false
	let breakCheckTransactionStatus: boolean = false
	try {
		const recentBlockhash = (await global.web3Conn.getLatestBlockhash("finalized")).blockhash;
		let bundleTx = new Bundle(bundleTransactions, 5);
		bundleTx.addTipTx(payer, fee * LAMPORTS_PER_SOL, tipAccount, recentBlockhash);

		searcher.onBundleResult(
			async (bundleResult: any) => {
				console.log(bundleResult);

				if (bundleResult.rejected) {
					try {
						if (bundleResult.rejected.simulationFailure.msg.includes("custom program error") ||
							bundleResult.rejected.simulationFailure.msg.includes("Error processing Instruction")) {
							breakCheckTransactionStatus = true
						}
						else if (bundleResult.rejected.simulationFailure.msg.includes("This transaction has already been processed") ||
							bundleResult.rejected.droppedBundle.msg.includes("Bundle partially processed")) {
							transactionsConfirmResult = true
							breakCheckTransactionStatus = true
						}
					} catch (error) {

					}
				}
			},
			(error) => {
				console.log("Bundle error:", error);
				breakCheckTransactionStatus = true
			}
		);
		await searcher.sendBundle(bundleTx);
		setTimeout(() => { breakCheckTransactionStatus = true }, 20000)
		const trxHash = base58.encode(bundleTransactions[bundleTransactions.length - 1].signatures[0])
		while (!breakCheckTransactionStatus) {
			await utils.sleep(2000)
			try {
				const result = await global.web3Conn.getSignatureStatus(trxHash, {
					searchTransactionHistory: true,
				});
				if (result && result.value && result.value.confirmationStatus) {
					transactionsConfirmResult = true
					breakCheckTransactionStatus = true
				}
			} catch (error) {
				transactionsConfirmResult = false
				breakCheckTransactionStatus = true
			}
		}
		return transactionsConfirmResult
	} catch (error) {
		console.error("Creating and sending bundle failed...", error);
		return false
	}
};

