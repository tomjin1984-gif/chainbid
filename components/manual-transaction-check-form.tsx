"use client";

import { RefreshCw } from "lucide-react";
import { useState, type FormEvent } from "react";

interface ManualMatch {
  credited: boolean;
  networkChanged: boolean;
  order: {
    publicId: string;
    status: string;
    expectedTransferAmountDisplay: string;
    bidCreditUsdt: string;
  };
  project: {
    name: string;
    url: string;
    category: string;
  } | null;
  network: {
    label: string;
    tokenStandard: string;
  };
  verification: {
    status: string;
    txHash: string | null;
    senderAddress: string | null;
    receiverAddress: string | null;
    amountAtomic: string | null;
    blockNumberOrSlot: string | null;
    confirmations: number;
    failureReason: string | null;
    explorerUrl: string | null;
  };
}

interface ManualCheckPayload {
  error?: string;
  txHash?: string;
  matched?: boolean;
  matches?: ManualMatch[];
  message?: string;
}

function parsePayload(text: string): ManualCheckPayload {
  try {
    return text ? JSON.parse(text) : { error: "The server returned an empty response." };
  } catch {
    return { error: text || "The server returned an unreadable response." };
  }
}

function statusLabel(match: ManualMatch) {
  if (match.order.status === "credited") {
    return "Credited to leaderboard";
  }
  if (match.verification.status === "unconfirmed") {
    return `Detected, waiting for confirmations (${match.verification.confirmations})`;
  }
  if (match.verification.status === "confirmed") {
    return "Confirmed on-chain";
  }
  if (match.order.status === "manual_review") {
    return "Manual review required";
  }
  return match.verification.status.replace(/_/g, " ");
}

export function ManualTransactionCheckForm() {
  const [txHash, setTxHash] = useState("");
  const [loading, setLoading] = useState(false);
  const [payload, setPayload] = useState<ManualCheckPayload | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setPayload(null);

    try {
      const response = await fetch("/api/manual-transaction-check", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ txHash }),
      });
      const parsed = parsePayload(await response.text());
      setPayload(response.ok ? parsed : { error: parsed.error ?? "Manual check failed." });
    } catch (error) {
      setPayload({
        error: error instanceof Error ? error.message : "Manual check failed.",
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="manual-check-form" onSubmit={submit}>
      <label>
        Transaction hash
        <input
          value={txHash}
          onChange={(event) => setTxHash(event.target.value)}
          placeholder="0x... or Solana signature"
          autoComplete="off"
        />
      </label>
      <button className="button submit-button" type="submit" disabled={loading}>
        <RefreshCw size={18} />
        {loading ? "Checking" : "Check transaction"}
      </button>

      {payload?.error ? <p className="error-line">{payload.error}</p> : null}
      {payload && !payload.error ? (
        <div className="manual-check-results" aria-live="polite">
          <p className={payload.matched ? "status-message" : "warning-line"}>
            {payload.message}
          </p>
          {payload.matches?.map((match) => (
            <article className="manual-check-result-card" key={match.order.publicId}>
              <div>
                <span>Project</span>
                {match.project ? (
                  <a href={match.project.url} target="_blank" rel="noopener noreferrer">
                    {match.project.name}
                  </a>
                ) : (
                  <strong>Project record not found</strong>
                )}
                <small>{match.project?.category ?? "Unknown category"}</small>
              </div>
              <div>
                <span>Bid / boost</span>
                <strong>{match.order.bidCreditUsdt} USDT</strong>
                <small>{match.order.expectedTransferAmountDisplay}</small>
              </div>
              <div>
                <span>Network</span>
                <strong>{match.network.label}</strong>
                <small>{match.network.tokenStandard}</small>
              </div>
              <div>
                <span>Transfer status</span>
                <strong>{statusLabel(match)}</strong>
                <small>{match.order.status}</small>
              </div>
              <dl className="manual-chain-data">
                <div>
                  <dt>Receiver</dt>
                  <dd>{match.verification.receiverAddress}</dd>
                </div>
                <div>
                  <dt>Sender</dt>
                  <dd>{match.verification.senderAddress ?? "Not returned"}</dd>
                </div>
                <div>
                  <dt>Amount atomic</dt>
                  <dd>{match.verification.amountAtomic ?? "Not returned"}</dd>
                </div>
                <div>
                  <dt>Block / slot</dt>
                  <dd>{match.verification.blockNumberOrSlot ?? "Not returned"}</dd>
                </div>
                <div>
                  <dt>Confirmations</dt>
                  <dd>{match.verification.confirmations}</dd>
                </div>
                <div>
                  <dt>Failure reason</dt>
                  <dd>{match.verification.failureReason ?? "None"}</dd>
                </div>
              </dl>
              {match.verification.explorerUrl ? (
                <a
                  className="button button-secondary button-small"
                  href={match.verification.explorerUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on explorer
                </a>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </form>
  );
}
