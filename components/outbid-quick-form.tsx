"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { CategoryDropdown } from "@/components/category-dropdown";
import type { SupportedNetwork } from "@/lib/domain/types";

interface NetworkOption {
  network: SupportedNetwork;
  label: string;
  tokenStandard: string;
  enabled: boolean;
}

const shortNetworkLabels: Record<SupportedNetwork, string> = {
  tron: "TRON",
  ethereum: "ETH",
  bsc: "BNB",
  solana: "SOL",
};

export function OutbidQuickForm({
  formId,
  defaultCategory = "DeFi",
  networks,
}: {
  formId: string;
  defaultCategory?: string;
  networks: NetworkOption[];
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [network, setNetwork] = useState<SupportedNetwork>(
    networks.find((item) => item.enabled)?.network ?? "bsc",
  );
  const selectedNetwork = networks.find((item) => item.network === network);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus(null);

    const form = event.currentTarget;
    const data = new FormData(form);
    const url = String(data.get("url") ?? "").trim();
    const category = String(data.get("category") ?? defaultCategory);
    const target = String(data.get("target") ?? "5");

    if (!url) {
      setStatus("Enter a project URL before continuing.");
      return;
    }

    if (!selectedNetwork?.enabled) {
      setStatus("Choose an available payment network before continuing.");
      return;
    }

    setBusy(true);

    try {
      const response = await fetch("/api/payment-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          project: {
            url,
            category,
          },
          network,
          bidTotalUsdt: target,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        order?: { publicId: string };
        developmentCheckoutToken?: string | null;
      };

      if (!response.ok || !payload.order) {
        setStatus(payload.error ?? "Unable to create payment order.");
        return;
      }

      const devQuery = payload.developmentCheckoutToken
        ? `?dev=${encodeURIComponent(payload.developmentCheckoutToken)}`
        : "";
      window.location.assign(`/checkout/${payload.order.publicId}${devQuery}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Unexpected error.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <form id={formId} className="outbid-submit-row" action="/submit" method="get" onSubmit={submit}>
        <label>
          <span className="input-icon" aria-hidden="true">⌁</span>
          <span className="sr-only">Project URL</span>
          <input name="url" placeholder="https://example.xyz" />
        </label>
        <CategoryDropdown defaultValue={defaultCategory} />
        <div className="outbid-network-picker" aria-label="Payment network">
          {networks.map((option) => (
            <button
              className={option.network === network ? "outbid-network-option active" : "outbid-network-option"}
              disabled={!option.enabled || busy}
              key={option.network}
              onClick={() => setNetwork(option.network)}
              title={option.enabled ? option.label : `${option.label} is not configured yet`}
              type="button"
            >
              <span>{shortNetworkLabels[option.network]}</span>
              <small>{option.enabled ? option.tokenStandard.replace("USDT ", "") : "Off"}</small>
            </button>
          ))}
        </div>
        <button className="button outbid-submit-button" type="submit" disabled={busy}>
          {busy ? "Creating" : "Outbid"}
          {busy ? <CheckCircle2 size={18} /> : <ArrowRight size={18} />}
        </button>
      </form>
      {status ? <p className="outbid-form-status">{status}</p> : null}
    </>
  );
}
