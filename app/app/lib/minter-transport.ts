import { Connection, Transaction, type Commitment, type SendOptions, type TransactionConfirmationStrategy } from "@solana/web3.js";
import bs58 from "bs58";
import { Buffer } from "buffer";

export class MinterPendingError extends Error {
  constructor(public readonly signature: string) {
    super(`The transaction is not confirmed yet. Check signature ${signature} before submitting another purchase or publication.`);
    this.name = "MinterPendingError";
  }
}
export class MinterRejectedError extends Error {
  constructor(message: string) { super(message); this.name = "MinterRejectedError"; }
}

/** The wallet still signs. This connection exposes no private provider URL and
 * confirms through bounded HTTP polling, without a provider WebSocket. */
export class MinterConnection extends Connection {
  private readonly pollInterval: number;
  private readonly confirmationTimeout: number;
  constructor(origin: string, options: { fetchImpl?: typeof fetch; pollIntervalMs?: number; confirmationTimeoutMs?: number } = {}) {
    const url = new URL(origin);
    if (url.origin !== origin || url.username || url.password || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Use the avatar store's own origin.");
    const fetcher = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    super(`${origin}/api/devnet-rpc`, { commitment: "confirmed", disableRetryOnRateLimit: true,
      fetch: async (input, init) => {
        const body = typeof init?.body === "string" ? JSON.parse(init.body) : {};
        let response: Response;
        try { response = await fetcher(input, { ...init, credentials: "omit", redirect: "error", signal: AbortSignal.timeout(30_000) }); }
        catch (error) {
          if (body.method !== "sendTransaction") throw error;
          return Response.json({ jsonrpc: "2.0", id: body.id, error: { code: -32098, message: "Submission status is unknown. Check confirmation before another purchase." } });
        }
        // web3.js must receive the redacted JSON-RPC error code, including when
        // the HTTP route correctly reports 4xx/5xx status to other clients.
        if (!response.ok) {
          let payload: any; try { payload = await response.json(); } catch { throw new Error("The avatar transaction service is unavailable."); }
          if (!payload?.error || payload.jsonrpc !== "2.0") throw new Error("The avatar transaction service is unavailable.");
          if (body.method === "sendTransaction" && [-32602, -32002].includes(payload.error.code)) throw new MinterRejectedError(payload.error.message);
          return Response.json(payload);
        }
        return response;
      },
    });
    this.pollInterval = options.pollIntervalMs ?? 1_500;
    this.confirmationTimeout = options.confirmationTimeoutMs ?? 45_000;
  }
  override async sendRawTransaction(raw: Buffer | Uint8Array | Array<number>, options?: SendOptions): Promise<string> {
    try { return await super.sendRawTransaction(raw, options); }
    catch (error) {
      // No retransmission: a transport failure may occur after RPC accepted it.
      // Poll the original signed transaction's known signature instead.
      if (error instanceof Error && /-32098|Submission status is unknown/.test(error.message)) {
        const transaction = Transaction.from(Buffer.from(raw));
        if (transaction.signature) return bs58.encode(transaction.signature);
      }
      throw error;
    }
  }
  override async confirmTransaction(strategy: TransactionConfirmationStrategy | string, commitment?: Commitment) {
    const signature = typeof strategy === "string" ? strategy : strategy.signature;
    const abortSignal = typeof strategy === "string" ? undefined : strategy.abortSignal;
    let timer: ReturnType<typeof setTimeout> | undefined, finished = false;
    const deadline = new Promise<never>((_, reject) => { timer = setTimeout(() => { finished = true; reject(new MinterPendingError(signature)); }, this.confirmationTimeout); });
    const poll = async () => {
      while (!finished) {
        if (abortSignal?.aborted) throw new MinterPendingError(signature);
        const response = await this.getSignatureStatuses([signature], { searchTransactionHistory: true });
        if (finished) throw new MinterPendingError(signature);
        const status = response.value[0];
        if (status && (status.err || status.confirmationStatus === "finalized" || (commitment !== "finalized" && status.confirmationStatus === "confirmed"))) return { context: response.context, value: { err: status.err } };
        await new Promise((resolve) => setTimeout(resolve, this.pollInterval));
      }
      throw new MinterPendingError(signature);
    };
    try { return await Promise.race([poll(), deadline]); }
    catch (error) { if (error instanceof MinterPendingError) throw error; throw new MinterPendingError(signature); }
    finally { finished = true; if (timer) clearTimeout(timer); }
  }
}
