"use client";

import { Copy, RefreshCw, ShieldAlert } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { SupportedNetwork } from "@/lib/domain/types";

interface PublicOrder {
  publicId: string;
  network: SupportedNetwork;
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

interface NetworkOption {
  network: SupportedNetwork;
  label: string;
  tokenStandard: string;
  enabled: boolean;
}

interface NetworkDetails {
  network: SupportedNetwork;
  label: string;
  tokenStandard: string;
  warning: string;
}

interface PaymentOrderPayload {
  error?: string;
  order?: PublicOrder | null;
  network?: NetworkDetails | null;
  qrDataUrl?: string | null;
}

const shortNetworkLabels: Record<SupportedNetwork, string> = {
  tron: "TRON",
  ethereum: "ETH",
  bsc: "BNB",
  solana: "SOL",
};

function parsePayload(text: string, fallback: string): PaymentOrderPayload {
  try {
    return text ? JSON.parse(text) : { error: fallback };
  } catch {
    return { error: text || "The server returned an unreadable response." };
  }
}

export function CheckoutClient({
  initialOrder,
  projectName,
  initialNetwork,
  initialQrDataUrl,
  networks,
}: {
  initialOrder: PublicOrder;
  projectName: string;
  initialNetwork: NetworkDetails;
  initialQrDataUrl: string;
  networks: NetworkOption[];
}) {
  const [order, setOrder] = useState(initialOrder);
  const [network, setNetwork] = useState(initialNetwork);
  const [qrDataUrl, setQrDataUrl] = useState(initialQrDataUrl);
  const [txHash, setTxHash] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [switchingNetwork, setSwitchingNetwork] = useState<SupportedNetwork | null>(null);

  const statusLabel = useMemo(() => {
    if (order.status === "credited") {
      return "Bid credited";
    }
    if (order.status === "confirmed") {
      return "Payment confirmed";
    }
    if (order.status === "confirming") {
      return `Confirming on ${network.label}`;
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
  }, [network.label, order.status]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      const response = await fetch(`/api/payment-orders/${order.publicId}`);
      if (!response.ok) {
        return;
      }
      const payload = (await response.json()) as PaymentOrderPayload;
      if (payload.order) {
        setOrder(payload.order);
      }
      if (payload.network) {
        setNetwork(payload.network);
      }
      if (payload.qrDataUrl) {
        setQrDataUrl(payload.qrDataUrl);
      }
    }, 8000);

    return () => window.clearInterval(interval);
  }, [order.publicId]);

  async function copy(value: string, label: string) {
    await navigator.clipboard.writeText(value);
    setMessage(`${label} copied.`);
  }

  async function changeNetwork(nextNetwork: SupportedNetwork) {
    if (nextNetwork === order.network || switchingNetwork) {
      return;
    }

    setMessage(null);
    setSwitchingNetwork(nextNetwork);

    try {
      const response = await fetch(`/api/payment-orders/${order.publicId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ network: nextNetwork }),
      });
      const payload = parsePayload(
        await response.text(),
        "Network switch returned an empty response.",
      );

      if (!response.ok || !payload.order || !payload.network || !payload.qrDataUrl) {
        setMessage(payload.error ?? "Unable to switch payment network.");
        return;
      }

      setOrder(payload.order);
      setNetwork(payload.network);
      setQrDataUrl(payload.qrDataUrl);
      setMessage(`Payment details updated for ${payload.network.label}.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setSwitchingNetwork(null);
    }
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
            <strong>{network.label}</strong>
          </div>
          <div>
            <span>Status</span>
            <strong>{statusLabel}</strong>
          </div>
        </div>

        <div className="payment-box">
          <div>
            <span>{network.tokenStandard}</span>
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
          <div className="checkout-network-picker" aria-label="Payment network">
            {networks.map((option) => (
              <button
                className={option.network === order.network ? "checkout-network-option active" : "checkout-network-option"}
                disabled={!option.enabled || order.status !== "waiting" || Boolean(order.txHash) || Boolean(switchingNetwork)}
                key={option.network}
                onClick={() => changeNetwork(option.network)}
                title={option.enabled ? option.label : `${option.label} is not configured yet`}
                type="button"
              >
                <span>{shortNetworkLabels[option.network]}</span>
                <small>
                  {switchingNetwork === option.network
                    ? "Loading"
                    : option.enabled
                      ? option.tokenStandard.replace("USDT ", "")
                      : "Off"}
                </small>
              </button>
            ))}
          </div>
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
          <p>{network.warning} Payments are final once confirmed on-chain.</p>
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
