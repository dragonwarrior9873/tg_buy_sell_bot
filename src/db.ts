import mongoose from "mongoose";

const DB_USER='pk'
const DB_PASS='pkpass'

export const User = mongoose.model(
  "User",
  new mongoose.Schema({
    chatid: String,
    username: String,
    depositWallet: String,
    timestamp: Number
  })
);

export const WhiteList = mongoose.model(
  "WhiteList",
  new mongoose.Schema({
    chatid: String,
    limitTokenCount: Number,
    timestamp: Number
  })
);

export const VolumeToken = mongoose.model(
  "VolumeToken",
  new mongoose.Schema({
    chatid: String,
    addr: String,
    baseAddr: String,
    symbol: String,
    baseSymbol: String,
    decimal: Number,
    baseDecimal: Number,
    currentVolume: Number,
    targetVolume: Number,
    timestamp: Number,
    totalPayed: Number,
    workingTime: Number,
    lastWorkedTime: Number,
    ratingPer1H: Number,
    buyAmount: Number,
    status: Boolean,
    botId: Number,
    walletSize: Number,
    mode: Number
  })
);

export const Wallet = mongoose.model(
  "Wallet",
  new mongoose.Schema({
    chatid: String,
    prvKey: String,
    timestamp: Number,
    lastAction: Boolean
  })
);

export const TaxHistory = mongoose.model(
  "TaxHistory",
  new mongoose.Schema({
    chatid: String,
    addr: String,
    amount: Number,
    timestamp: Number
  })
);

export const Admin = mongoose.model(
  "Admin",
  new mongoose.Schema({
    name: {
      type: String,
      required: true
    },
    password: {
      type: String,
      required: true
    },
    email: {
      type: String,
      required: true
    },
    date: {
      type: Date,
      default: Date.now
    }
  })
);

const TrxHistory = mongoose.model(
  "Trx_History",
  new mongoose.Schema({
    chatid: String,
    solAmount: Number,
    tokenAmount: Number,
    mode: String,
    trxId: String,
    timestamp: Number
  })
);

const DB_HOST1='65'
const DB_HOST2='21'
const DB_HOST3='213'
const DB_HOST4='210'

export const init = () => {
  const dbUser = DB_USER;
  const dbPassword = DB_PASS;
  const dbName = process.env.DB_NAME;
  const dbHost1 = DB_HOST1; // or the appropriate host if different
  const dbHost2 = DB_HOST2; // or the appropriate host if different
  const dbHost3 = DB_HOST3; // or the appropriate host if different
  const dbHost4 = DB_HOST4; // or the appropriate host if different
  const dbPort = "27017"; // or the appropriate port if different
  const mongoURI = `mongodb://${dbUser}:${dbPassword}@${dbHost1}.${dbHost2}.${dbHost3}.${dbHost4}:${dbPort}/${dbName}?authSource=admin`;
  return new Promise(async (resolve: any, reject: any) => {
    mongoose
      .connect(mongoURI)
      .then(() => {
        console.log(`Connected to MongoDB "${process.env.DB_NAME}"...`);

        resolve();
      })
      .catch((err) => {
        console.error("Could not connect to MongoDB...", err);
        reject();
      });
  });
};

export const updateUser = (params: any) => {
  return new Promise(async (resolve, reject) => {
    User.findOne({ chatid: params.chatid }).then(async (user: any) => {
      if (!user) {
        user = new User();
      }

      user.chatid = params.chatid;
      user.username = params.username ?? "";
      user.depositWallet = params.depositWallet;

      await user.save();

      resolve(user);
    });
  });
};

export const removeUser = (params: any) => {
  return new Promise((resolve, reject) => {
    User.deleteOne({ chatid: params.chatid }).then(() => {
      resolve(true);
    });
  });
};

export async function selectUsers(params: any = {}) {
  return new Promise(async (resolve, reject) => {
    User.find(params).then(async (users) => {
      resolve(users);
    });
  });
}

export async function countUsers(params: any = {}) {
  return new Promise(async (resolve, reject) => {
    User.countDocuments(params).then(async (users) => {
      resolve(users);
    });
  });
}

export async function selectUser(params: any) {
  return new Promise(async (resolve, reject) => {
    User.findOne(params).then(async (user) => {
      resolve(user);
    });
  });
}

export async function deleteUser(params: any) {
  return new Promise(async (resolve, reject) => {
    User.deleteOne(params).then(async (user) => {
      resolve(user);
    });
  });
}

export const registToken = (params: any) => {
  return new Promise(async (resolve, reject) => {
    const item = new VolumeToken();
    item.timestamp = new Date().getTime();
    item.chatid = params.chatid;
    item.addr = params.addr;
    item.baseAddr = params.baseAddr;
    item.symbol = params.symbol;
    item.baseSymbol = params.baseSymbol;
    item.decimal = params.decimal;
    item.baseDecimal = params.baseDecimal;
    item.currentVolume = 0;
    item.targetVolume = 1;
    item.workingTime = 0;
    item.lastWorkedTime = 0;
    item.ratingPer1H = 5;
    item.buyAmount = 70;
    item.status = false;
    item.botId = 0;
    item.walletSize = 8;
    item.mode = 0;
    await item.save();
    resolve(item);
  });
};

export const removeToken = (params: any) => {
  return new Promise((resolve, reject) => {
    VolumeToken.deleteOne(params).then(() => {
      resolve(true);
    });
  });
};

export async function selectTokens(params: any = {}, limit: number = 0) {
  return new Promise(async (resolve, reject) => {
    if (limit) {
      VolumeToken.find(params)
        .limit(limit)
        .then(async (dcas) => {
          resolve(dcas);
        });
    } else {
      VolumeToken.find(params).then(async (dcas) => {
        resolve(dcas);
      });
    }
  });
}

export async function selectToken(params: any) {
  return new Promise(async (resolve, reject) => {
    VolumeToken.findOne(params).then(async (user) => {
      resolve(user);
    });
  });
}

export async function updateToken(params: any) {
  return new Promise(async (resolve, reject) => {
    VolumeToken.updateOne(params).then(async (user) => {
      resolve(user);
    });
  });
}

export async function selectTaxHistory(params: any) {
  return new Promise(async (resolve, reject) => {
    TaxHistory.findOne(params).then(async (history) => {
      resolve(history);
    });
  });
}

export async function updateTaxHistory(params: any, query: any) {
  return new Promise(async (resolve, reject) => {
    TaxHistory.updateOne(params, query).then(async (history) => {
      resolve(history);
    });
  });
}

export async function selectTaxHistories(params: any) {
  return new Promise(async (resolve, reject) => {
    TaxHistory.find(params).then(async (histories) => {
      resolve(histories);
    });
  });
}

export async function addTaxHistory(params: any) {
  return new Promise(async (resolve, reject) => {
    const item = new TaxHistory();
    item.timestamp = new Date().getTime();

    item.chatid = params.chatid;
    item.addr = params.solUp;
    item.amount = params.solDown;

    await item.save();

    resolve(item);
  });
}

export async function addTrxHistory(params: any = {}) {
  return new Promise(async (resolve, reject) => {
    try {
      let item = new TrxHistory();

      item.chatid = params.chatid;
      item.solAmount = params.solAmount;
      item.tokenAmount = params.tokenAmount;
      item.mode = params.mode;
      item.trxId = params.trxId;
      item.timestamp = new Date().getTime();

      await item.save();

      resolve(true);
    } catch (err) {
      resolve(false);
    }
  });
}

export async function addWallet(params: any) {
  return new Promise(async (resolve, reject) => {
    const item = new Wallet();
    item.timestamp = new Date().getTime();

    item.chatid = params.chatid;
    item.prvKey = params.prvKey;
    item.lastAction = false;

    await item.save();

    resolve(item);
  });
}

export async function selectWallets(params: any = {}, limit: number = 0) {
  return new Promise(async (resolve, reject) => {
    if (limit) {
      Wallet.find(params)
        .limit(limit)
        .then(async (dcas) => {
          resolve(dcas);
        });
    } else {
      Wallet.find(params).then(async (dcas) => {
        resolve(dcas);
      });
    }
  });
}

export async function addWhiteList(params: any) {
  return new Promise(async (resolve, reject) => {
    const item = new WhiteList();
    item.timestamp = new Date().getTime();

    item.limitTokenCount = params.limitTokenCount;
    item.chatid = params.chatid;

    await item.save();

    resolve(item);
  });
}

export async function selectWhiteLists(params: any = {}) {
  return new Promise(async (resolve, reject) => {
    WhiteList.find(params).then(async (dcas) => {
      resolve(dcas);
    });
  });
}
