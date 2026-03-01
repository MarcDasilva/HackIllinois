/**
 * Build and send a "mint" transaction: commits a hardened file to Solana via SPL Memo.
 * LAVA_MINT|v=1|file=<name>|hash=<sha256-hex>
 */

import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

export async function sha256Hex(data: Uint8Array): Promise<string> {
  const copy = new Uint8Array(data);
  const hash = await crypto.subtle.digest("SHA-256", copy);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Build memo payload for a hardened file (no signer keys required for basic memo). */
export function buildMintMemo(filename: string, contentHashHex: string): string {
  const safeName = filename.replace(/\|/g, "_");
  return `LAVA_MINT|v=1|file=${safeName}|hash=${contentHashHex}`;
}

/** Create a TransactionInstruction for the SPL Memo program. */
export function createMintMemoInstruction(memo: string): TransactionInstruction {
  const data =
    typeof Buffer !== "undefined"
      ? Buffer.from(memo, "utf8")
      : new Uint8Array(new TextEncoder().encode(memo));
  return new TransactionInstruction({
    keys: [],
    programId: MEMO_PROGRAM_ID,
    data: data as Buffer,
  });
}

/** Hash base64 file content and build a mint transaction (ready for wallet sign + send). */
export async function buildMintTransaction(
  connection: Connection,
  payerPublicKey: PublicKey,
  filename: string,
  contentBase64: string
): Promise<Transaction> {
  const binary = Uint8Array.from(atob(contentBase64), (c) => c.charCodeAt(0));
  const hashHex = await sha256Hex(binary);
  const memo = buildMintMemo(filename, hashHex);
  const ix = createMintMemoInstruction(memo);
  const tx = new Transaction().add(ix);
  tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
  tx.feePayer = payerPublicKey;
  return tx;
}
