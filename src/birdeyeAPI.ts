const birdeyeApi: any = require("api")("@birdeyedotso/v1.0#crnv83jlti6buqu");
birdeyeApi.auth(process.env.BIRDEYE_API_KEY);

export const getTokenDecimal = async (addr: string) => {
  try {
    const { data }: any = await birdeyeApi.getDefiToken_creation_info({
      address: addr,
      "x-chain": "solana",
    });
    return { exist: true, decimal: data.data.decimals };
  } catch (error) {
    return { exist: false, decimal: 0 };
  }
};
