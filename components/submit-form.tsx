"use client";

import { ArrowRight, CheckCircle2, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { categories } from "@/lib/seed";

interface NetworkOption {
  network: "tron" | "ethereum" | "bsc" | "solana";
  label: string;
  tokenStandard: string;
  enabled: boolean;
  sourceStatus: string;
}

interface BoostProject {
  id: string;
  name: string;
  domain: string;
  currentBidUsdt: string;
}

function formatFieldList(fields: string[]) {
  if (fields.length <= 1) {
    return fields[0] ?? "";
  }

  if (fields.length === 2) {
    return `${fields[0]} and ${fields[1]}`;
  }

  return `${fields.slice(0, -1).join(", ")}, and ${fields.at(-1)}`;
}

export function SubmitForm({
  networks,
  boostProject,
  defaultTarget,
  defaultUrl,
  defaultCategory,
}: {
  networks: NetworkOption[];
  boostProject?: BoostProject | null;
  defaultTarget?: string;
  defaultUrl?: string;
  defaultCategory?: string;
}) {
  const [network, setNetwork] = useState<NetworkOption["network"]>(
    networks.find((item) => item.enabled)?.network ?? "tron",
  );
  const [bid, setBid] = useState(defaultTarget ?? "5");
  const [url, setUrl] = useState(defaultUrl ?? "");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState(defaultCategory ?? "DeFi");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedNetwork = useMemo(
    () => networks.find((item) => item.network === network),
    [network, networks],
  );

  async function submit() {
    setStatus(null);

    if (!boostProject) {
      const missingFields = [
        { label: "project URL", value: url },
        { label: "project name", value: name },
        { label: "description", value: description },
      ]
        .filter((field) => !field.value.trim())
        .map((field) => field.label);

      if (missingFields.length) {
        setStatus(`Please enter ${formatFieldList(missingFields)} before continuing.`);
        return;
      }

      if (name.trim().length < 2) {
        setStatus("Project name must be at least 2 characters.");
        return;
      }

      if (description.trim().length < 10) {
        setStatus("Description must be at least 10 characters.");
        return;
      }
    }

    if (!bid.trim()) {
      setStatus("Please enter a bid amount before continuing.");
      return;
    }

    setBusy(true);

    try {
      const body = boostProject
          ? {
              projectId: boostProject.id,
              network,
              bidTotalUsdt: bid,
            }
          : {
              project: {
                url,
                name,
                description,
                category,
              },
              network,
              bidTotalUsdt: bid,
            };

      const response = await fetch("/api/payment-orders", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as {
        error?: string;
        order?: { publicId: string };
        project?: { slug: string };
        paymentPayload?: string;
        developmentCheckoutToken?: string | null;
        network?: {
          label: string;
          tokenStandard: string;
          warning: string;
        };
      };

      if (!response.ok || !payload.order) {
        setStatus(payload.error ?? "Unable to create payment order.");
        return;
      }

      window.sessionStorage.setItem(
        `chainbid.checkout.${payload.order.publicId}`,
        JSON.stringify(payload),
      );
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
    <div className="form-grid">
      <div className="form-panel">
        <div className="form-header">
          <p className="eyebrow">{boostProject ? "BOOST LISTING" : "SUBMIT PROJECT"}</p>
          <h1>{boostProject ? "Raise a verified bid." : "Enter the leaderboard."}</h1>
        </div>

        {boostProject ? (
          <div className="boost-summary">
            <span>{boostProject.name}</span>
            <strong>{boostProject.currentBidUsdt}</strong>
            <small>{boostProject.domain}</small>
          </div>
        ) : (
          <div className="field-stack">
            <label>
              Project URL
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://example.xyz" />
            </label>
            <label>
              Project Name
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Example Protocol" />
            </label>
            <label>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Short, factual description of the project." />
            </label>
            <label>
              Category
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                {categories
                  .filter((item) => item !== "All")
                  .map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
              </select>
            </label>
          </div>
        )}

        <div className="field-stack">
          <label>
            {boostProject ? "Target Total Bid" : "Initial Bid"}
            <input value={bid} onChange={(event) => setBid(event.target.value)} inputMode="numeric" />
          </label>
        </div>

        <div className="network-picker" aria-label="USDT network">
          {networks.map((option) => (
            <button
              className={option.network === network ? "network-option network-active" : "network-option"}
              disabled={!option.enabled}
              key={option.network}
              onClick={() => setNetwork(option.network)}
              type="button"
            >
              <span>{option.label}</span>
              <small>{option.enabled ? option.tokenStandard : "Disabled"}</small>
            </button>
          ))}
        </div>

        {selectedNetwork?.sourceStatus === "requires_manual_approval" ? (
          <p className="warning-line">
            <ShieldCheck size={16} />
            This network is available in the architecture but cannot be enabled for production checkout until its USDT contract source is approved.
          </p>
        ) : null}

        {status ? <p className="error-line">{status}</p> : null}

        <button className="button submit-button" type="button" onClick={submit} disabled={busy}>
          <span>{busy ? "Creating Order" : "Continue to USDT Checkout"}</span>
          {busy ? <CheckCircle2 size={18} /> : <ArrowRight size={18} />}
        </button>
      </div>

      <aside className="side-note">
        <p className="eyebrow">PAYMENT SAFETY</p>
        <h2>Server verification only.</h2>
        <p>
          The checkout creates a unique payable USDT amount. A pasted transaction hash is only a hint; the server still checks the chain, token, receiver, amount, time window, finality, and duplicate use before crediting.
        </p>
      </aside>
    </div>
  );
}
