"use client";

import { Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

interface PublicOrder {
  publicId: string;
  status: string;
  receiverAddress: string;
  expectedTransferAmountDisplay: string;
  bidCreditUsdt: string;
  expiresAt: string;
  txHash: string | null;
  confirmations: number;
}

interface PublicVerification {
  status: string;
  confirmations: number;
  failureReason: string | null;
}

export function CheckoutClient({
  initialOrder,
  projectName,
  networkLabel,
  tokenStandard,
  qrDataUrl,
  warning,
}: {
  initialOrder: PublicOrder;
  projectName: string;
  networkLabel: string;
  tokenStandard: string;
  qrDataUrl: string;
  warning: string;
}) {
  const [order, setOrder] = useState(initialOrder);
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  const statusLabel = useMemo(() => {
    if (order.status === "credited") {
      return "Bid credited";
    }
    if (order.status === "confirmed") {
      return "Payment confirmed";
    }
    if (order.status === "confirming") {
      return `Confirming on ${networkLabel}`;
    }
    if (order.status === "detected") {
      return "Payment detected";
    }
    if (order.status === "manual_review") {
      return "Manual review required";
    }
    if (order.status === "expired") {
      return "Payment window expired";
    }
    return "Waiting for payment";
  }, [networkLabel, order.status]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/payment-orders/${order.publicId}`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as { order: PublicOrder };
      setOrder(payload.order);
    }, 8000);

    return () => window.clearInterval(interval);
  }, [order.publicId]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function verify() {
    setMessage(null);
    const response = await fetch(`/api/payment-orders/${order.publicId}/verify`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ txHash }),
    });
    const text = await response.text();
    let payload: {
      error?: string;
      order?: PublicOrder | null;
      verification?: PublicVerification | null;
      credited?: boolean;
    };
    try {
      payload = text ? JSON.parse(text) : { error: "Verification returned an empty response." };
    } catch {
      payload = { error: text || "Verification returned an unreadable response." };
    }
    if (!response.ok) {
      setMessage(payload.error ?? "Verification request failed.");
      return;
    }
    if (payload.order) {
      setOrder(payload.order);
    }
    if (payload.credited || payload.order?.status === "credited") {
      setMessage("Payment credited. The project is now on the leaderboard.");
      return;
    }
    if (payload.verification?.status === "unconfirmed") {
      setMessage(`Payment detected. Waiting for confirmations (${payload.verification.confirmations}).`);
      return;
    }
    if (payload.verification?.failureReason) {
      setMessage(payload.verification.failureReason);
      return;
    }
    setMessage("Verification check requested.");
  }

  return (
    <div className="checkout-grid">
      <section className="checkout-panel">
        <p className="eyebrow">COMPLETE YOUR BID</p>
        <h1>{projectName}</h1>
        <div className="checkout-stats">
          <div>
            <span>Bid credit</span>
            <strong>{order.bidCreditUsdt} USDT</strong>
          </div>
          <div>
            <span>Network</span>
            <strong>{networkLabel}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </div>
        </div>

        <div className="payment-box">
          <div>
            <span>{tokenStandard}</span>
            <strong>Send exactly {order.expectedTransferAmountDisplay}</strong>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrDataUrl} alt="Payment QR code" className="qr-code" />
          <label>
            To
            <input readOnly value={order.receiverAddress} />
          </label>
          <label>
            Amount
            <input readOnly value={order.expectedTransferAmountDisplay.replace(" USDT", "")} />
          </label>
          <div className="copy-row">
            <button className="button button-secondary button-small" onClick={() => copy(order.receiverAddress, "Address")} type="button">
              <Copy size={16} />
              Address
            </button>
            <button className="button button-secondary button-small" onClick={() => copy(order.expectedTransferAmountDisplay.replace(" USDT", ""), "Amount")} type="button">
              <Copy size={16} />
              Amount
            </button>
          </div>
        </div>

        <div className="warning-box">
          <ShieldAlert size={18} />
          <p>{warning} Payments are final once confirmed on-chain.</p>
        </div>
      </section>

      <aside className="checkout-panel">
        <p className="eyebrow">I ALREADY PAID</p>
        <h2>Manual transaction check</h2>
        <p className="muted-copy">
          Paste a transaction hash to trigger independent verification. This does not directly credit the bid.
        </p>
        <label>
          Transaction hash
          <input value={txHash} onChange={(event) => setTxHash(event.target.value)} placeholder="0x... or chain signature" />
        </label>
        <button className="button submit-button" type="button" onClick={verify}>
          <RefreshCw size={18} />
          Check Payment
        </button>
        {message ? <p className="status-message">{message}</p> : null}
      </aside>
    </div>
  );
}
