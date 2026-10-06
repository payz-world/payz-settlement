import {
  createPublicClient,
  http,
  parseUnits,
  type Address,
  type Hex,
} from "viem";
import { mainnet } from "viem/chains";
import { nonceManager, privateKeyToAccount } from "viem/accounts";
import type { SettlementProvider } from "payz-core/contracts";
import { getPlatformSettlementAddress } from "./platform-wallet";

const USDC_ADDRESS = "0xA0b86991c6218b36c1d19d4a2e9eb0ce3606eb48" as Address;
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const REQUIRED_CONFIRMATIONS = 3;

type RpcClients = {
  publicClient: ReturnType<typeof createPublicClient>;
  rpcUrl: string;
};

let cachedRpc: RpcClients | null = null;
let cachedAccount: { key: string; account: ReturnType<typeof privateKeyToAccount> } | null = null;

function getRpcUrl(): string | null {
  const value = process.env.PAYZ_ETHEREUM_RPC_URL?.trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function getRpc(): RpcClients | null {
  const rpcUrl = getRpcUrl();
  if (!rpcUrl) return null;
  if (cachedRpc?.rpcUrl === rpcUrl) return cachedRpc;
  cachedRpc = {
    rpcUrl,
    publicClient: createPublicClient({
      chain: mainnet,
      transport: http(rpcUrl, { timeout: 12_000, retryCount: 0 }),
    }),
  };
  return cachedRpc;
}

function getAccount() {
  const value = process.env.PLATFORM_WALLET_KEY?.trim();
  if (!value) return null;
  const key = (value.startsWith("0x") ? value : `0x${value}`) as Hex;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) return null;
  if (cachedAccount?.key === key) return cachedAccount.account;
  try {
    const account = privateKeyToAccount(key, { nonceManager });
    cachedAccount = { key, account };
    return account;
  } catch {
    return null;
  }
}

function positiveUsdUnits(amount: string): bigint | null {
  try {
    const [whole, fraction = ""] = amount.split(".");
    const normalizedFraction = fraction.replace(/0+$/, "");
    const normalized = normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
    const units = parseUnits(normalized, 6);
    return units > 0n ? units : null;
  } catch {
    return null;
  }
}

export function isEthereumSettlementConfigured(): boolean {
  return Boolean(getRpc() && getAccount());
}

export async function verifyUsdcOutputTransfer(input: {
  transactionHash: string;
  recipient: Address;
  expectedAmount: string;
}): Promise<{
  status: "pending" | "unavailable" | "reverted" | "insufficient" | "verified";
  confirmations: number;
}> {
  const rpc = getRpc();
  const expected = positiveUsdUnits(input.expectedAmount);
  if (!rpc || expected === null || !/^0x[0-9a-fA-F]{64}$/.test(input.transactionHash)) {
    return { status: "unavailable", confirmations: 0 };
  }
  try {
    const receipt = await rpc.publicClient.getTransactionReceipt({
      hash: input.transactionHash as Hex,
    });
    if (receipt.status !== "success") return { status: "reverted", confirmations: 0 };
    const currentBlock = await rpc.publicClient.getBlockNumber();
    const confirmations =
      currentBlock >= receipt.blockNumber
        ? Number(currentBlock - receipt.blockNumber + 1n)
        : 0;
    if (confirmations < REQUIRED_CONFIRMATIONS) {
      return { status: "pending", confirmations };
    }
    const transaction = await rpc.publicClient.getTransaction({
      hash: input.transactionHash as Hex,
    });
    if (transaction.to?.toLowerCase() !== USDC_ADDRESS.toLowerCase()) {
      return { status: "insufficient", confirmations };
    }
    let received = 0n;
    for (const log of receipt.logs) {
      if (
        log.address.toLowerCase() !== USDC_ADDRESS.toLowerCase() ||
        log.topics[0]?.toLowerCase() !== TRANSFER_TOPIC ||
        !log.topics[2] ||
        log.topics[2].slice(-40).toLowerCase() !== input.recipient.slice(2).toLowerCase()
      ) {
        continue;
      }
      try {
        received += BigInt(log.data);
      } catch {
        return { status: "unavailable", confirmations };
      }
    }
    return {
      status: received === expected ? "verified" : "insufficient",
      confirmations,
    };
  } catch {
    return { status: "pending", confirmations: 0 };
  }
}

export const ethereumSettlementProvider: SettlementProvider = {
  isConfigured: isEthereumSettlementConfigured,
  getAddress: () => getPlatformSettlementAddress(),
  async verifyOutputTransfer(input) {
    if (!/^0x[0-9a-fA-F]{40}$/.test(input.recipient)) {
      return { status: "unavailable", confirmations: 0 };
    }
    return verifyUsdcOutputTransfer({
      ...input,
      recipient: input.recipient as Address,
    });
  },
};

