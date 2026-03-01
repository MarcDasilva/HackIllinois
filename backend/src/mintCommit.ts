/**
 * Backend-paid mint: commit LAVA_MINT memo to Solana so the user pays no fee.
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import * as fs from "fs";
import * as path from "path";

const MEMO_PROGRAM_ID = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

function loadKeypair(): Keypair | null {
  const rawPath = process.env.SOLANA_KEYPAIR_PATH;
  if (!rawPath?.trim()) return null;
  const resolved = path.resolve(rawPath.replace(/^~/, process.env.HOME ?? ""));
  try {
    const content = fs.readFileSync(resolved, "utf8");
    const parsed = JSON.parse(content) as number[];
    if (!Array.isArray(parsed) || parsed.length < 64) return null;
    return Keypair.fromSecretKey(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

function buildMemoInstruction(memo: string, signerPubkey?: PublicKey): TransactionInstruction {
  const keys = signerPubkey
    ? [{ pubkey: signerPubkey, isSigner: true, isWritable: false }]
    : [];
  return new TransactionInstruction({
    keys,
    programId: MEMO_PROGRAM_ID,
    data: Buffer.from(memo, "utf8"),
  });
}

function buildMintMemo(filename: string, contentHashHex: string, wallet?: string): string {
  const safeName = filename.replace(/\|/g, "_");
  let memo = `LAVA_MINT|v=1|file=${safeName}|hash=${contentHashHex}`;
  if (wallet?.trim()) memo += `|wallet=${wallet.trim()}`;
  return memo;
}

export interface MintCommitParams {
  filename: string;
  content_hash: string;
  wallet?: string;
}

export interface MintCommitResult {
  success: boolean;
  signature?: string;
  /** When wallet is provided: backend pays, user must sign; return serialized tx for frontend to sign + send */
  serializedTransaction?: string;
  error?: string;
}

let cachedKeypair: Keypair | null | undefined = undefined;

function getPayerKeypair(): Keypair | null {
  if (cachedKeypair === undefined) cachedKeypair = loadKeypair();
  return cachedKeypair ?? null;
}

export async function commitMint(params: MintCommitParams): Promise<MintCommitResult> {
  const keypair = getPayerKeypair();
  if (!keypair) {
    return { success: false, error: "Mint not configured. Set SOLANA_KEYPAIR_PATH and fund the keypair on devnet." };
  }

  const rpcUrl = process.env.SOLANA_RPC_URL?.trim() || "https://api.devnet.solana.com";
  const connection = new Connection(rpcUrl);

  const userPubkey = params.wallet?.trim() ? new PublicKey(params.wallet.trim()) : null;
  const memo = buildMintMemo(params.filename, params.content_hash, params.wallet);
  const ix = buildMemoInstruction(memo, userPubkey ?? undefined);
  const tx = new Transaction().add(ix);

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = keypair.publicKey;

  try {
    if (!userPubkey) {
      // No wallet: backend signs and sends (no popup)
      const sig = await connection.sendTransaction(tx, [keypair], {
        skipPreflight: false,
        preflightCommitment: "confirmed",
      });
      await connection.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, "confirmed");
      return { success: true, signature: sig };
    }

    // Wallet provided: backend signs (pays fee), return serialized tx for frontend to sign (popup) + send
    tx.partialSign(keypair);
    const serialized = tx.serialize({ requireAllSignatures: false }).toString("base64");
    return { success: true, serializedTransaction: serialized };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message };
  }
}
