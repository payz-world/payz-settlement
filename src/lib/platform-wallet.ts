import { privateKeyToAccount } from "viem/accounts";
import type { Address, Hex } from "viem";

export function getPlatformSettlementAddress(): Address | null {
  const privateKey = process.env.PLATFORM_WALLET_KEY?.trim();
  if (!privateKey) return null;
  const normalized = (privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(normalized)) return null;
  try {
    return privateKeyToAccount(normalized).address;
  } catch {
    return null;
  }
}
