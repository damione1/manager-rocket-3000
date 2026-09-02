export type PublicItem = {
  itemID: string;
  systemSku: string;
  description: string;
  upc: string;
  customSku: string;
  manufacturerSku: string;
};

export type Me = {
  name: string;
  shopName: string;
  email: string;
};

async function parse<T>(response: Response): Promise<T> {
  const json = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(json.error || response.statusText);
  }
  return json;
}

export async function getMe(): Promise<Me | null> {
  const response = await fetch("/api/me");
  if (response.status === 401) return null;
  return parse<Me>(response);
}

export async function getItem(sku: string): Promise<PublicItem> {
  const response = await fetch(`/api/items?sku=${encodeURIComponent(sku)}`);
  const json = await parse<{ item: PublicItem }>(response);
  return json.item;
}

export async function updateUpc(itemId: string, upc: string): Promise<PublicItem> {
  const response = await fetch(`/api/items/${encodeURIComponent(itemId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ upc }),
  });
  const json = await parse<{ item: PublicItem }>(response);
  return json.item;
}

export async function logout(): Promise<void> {
  await fetch("/api/auth/logout", { method: "POST" });
}
