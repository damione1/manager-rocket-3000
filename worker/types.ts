export interface Env {
  LIGHTSPEED_CLIENT_ID: string;
  LIGHTSPEED_CLIENT_SECRET: string;
  AUTH_SECRET: string;
}

export type SessionData = {
  accessToken: string;
  refreshToken: string;
  accessTokenExpires: number;
  accountId: string;
  name: string;
  shopName: string;
  email: string;
};

export type LightspeedItem = {
  itemID: string;
  systemSku: string;
  description: string;
  upc: string;
  ean: string;
  customSku: string;
  manufacturerSku: string;
};

export type PublicItem = {
  itemID: string;
  systemSku: string;
  description: string;
  upc: string;
  customSku: string;
  manufacturerSku: string;
};
