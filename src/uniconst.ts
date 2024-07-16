export const JITO_AUTH_KEYS = [
  "4EhHPoqXKxgWR9JZQz2Mjy7hPCtJzp2RGtCENdWFEvHJcztRXu6GWNXi1aHA9J7fXso4T89hrGzhpcUZmtqoAnrp",
  "4EhHPoqXKxgWR9JZQz2Mjy7hPCtJzp2RGtCENdWFEvHJcztRXu6GWNXi1aHA9J7fXso4T89hrGzhpcUZmtqoAnrp",
  "4EhHPoqXKxgWR9JZQz2Mjy7hPCtJzp2RGtCENdWFEvHJcztRXu6GWNXi1aHA9J7fXso4T89hrGzhpcUZmtqoAnrp"
];

export const PRIORITY_RATE = 100000

export const JITO_BUNDLE_TIP = 0.0003
export const JITO_FEE_AMOUNT = 1;

export const MIN_DIVIDE_SOL = 0.1;
export const MIN_TARGET_VOLUME = 0.1;
export const MIN_TAX_AMOUNT = 0.0001;

export const MAX_WALLET_SIZE = 8;

export const VOLUME_UNIT = 1000000;

export const SOL_TAX_FEE_PER_1M_VOLUME = 10;
export const SOL_TAX_FEE_PER_HOUR = 0.05;
export const SOL_TAX_FEE_PER_DAY = 2;
export const SOL_TAX_FEE_PER_TRX = 0.005;
export const SOL_TAX_FEE_RATING = 12;

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const LIMIT_FREE_TOKEN_COUNT = 2;
export const LIMIT_REST_SOL_AMOUNT = 0.01;

export enum SWAP_MODE {
  SYNC = 0,
  MIX,
  ORDER
}

export enum ResultCode {
  SUCCESS = 0,
  INTERNAL,
  PARAMETER,
  USER_INSUFFICIENT_SOL,
  USER_INSUFFICIENT_JITO_FEE_SOL,
  USER_INSUFFICIENT_ENOUGH_SOL,
  INVALIDE_USER,
  INVALIDE_TOKEN,
}

export const BOT_FOOTER_DASH = ""

export const RAYDIUM_POOL_KEY_URL = "https://api.raydium.io/v2/sdk/liquidity/mainnet.json"