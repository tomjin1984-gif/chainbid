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
  currentBidDisplay: string;
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

function parseWholeUsdtInput(value: string) {
  const trimmed = value.trim();
  if (!/^(0|[1-9][0-9]*)$/.test(trimmed)) {
    return null;
  }

  return BigInt(trimmed);
}

function formatWholeUsdt(value: bigint) {
  return `${new Intl.NumberFormat("en-US").format(value)} USDT`;
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
  const currentBoostTotal = boostProject ? parseWholeUsdtInput(boostProject.currentBidUsdt) : null;
  const defaultBoostTarget = boostProject && defaultTarget ? parseWholeUsdtInput(defaultTarget) : null;
  const minimumBoostAmount =
    boostProject && currentBoostTotal
      ? defaultBoostTarget && defaultBoostTarget > currentBoostTotal
        ? defaultBoostTarget - currentBoostTotal
        : BigInt(1)
      : null;
  const [network, setNetwork] = useState<NetworkOption["network"]>(
    networks.find((item) => item.enabled)?.network ?? "tron",
  );
  const [bid, setBid] = useState(
    boostProject ? (minimumBoostAmount?.toString() ?? "1") : (defaultTarget ?? "5"),
  );
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
      ]
        .filter((field) => !field.value.trim())
        .map((field) => field.label);

      if (missingFields.length) {
        setStatus(`Please enter ${formatFieldList(missingFields)} before continuing.`);
        return;
      }
    }

    if (!bid.trim()) {
      setStatus("Please enter a bid amount before continuing.");
      return;
    }

    const bidAmount = parseWholeUsdtInput(bid);
    const minimumInputAmount = boostProject ? BigInt(1) : BigInt(5);
    if (!bidAmount || bidAmount < minimumInputAmount) {
      setStatus(
        boostProject
          ? "Please enter a whole USDT boost amount of at least 1."
          : "Please enter a whole USDT amount of at least 5.",
      );
      return;
    }

    if (boostProject) {
      if (!currentBoostTotal) {
        setStatus("This listing cannot be boosted right now. Please refresh and try again.");
        return;
      }

      if (minimumBoostAmount && bidAmount < minimumBoostAmount) {
        setStatus(`Enter at least ${formatWholeUsdt(minimumBoostAmount)} for this boost. You can enter any higher amount.`);
        return;
      }
    }

    setBusy(true);

    try {
      const boostTargetTotal =
        boostProject && currentBoostTotal ? currentBoostTotal + bidAmount : bidAmount;
      const minimumBoostTarget =
        boostProject && currentBoostTotal && minimumBoostAmount
          ? currentBoostTotal + minimumBoostAmount
          : null;
      const body = boostProject
          ? {
              projectId: boostProject.id,
              network,
              bidTotalUsdt: boostTargetTotal.toString(),
              ...(minimumBoostTarget
                ? { minimumBidTotalUsdt: minimumBoostTarget.toString() }
                : {}),
            }
          : {
              project: {
                url,
                name: name.trim() || undefined,
                description: description.trim() || undefined,
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
            <strong>{boostProject.currentBidDisplay}</strong>
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
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Auto-detected from the URL" />
            </label>
            <label>
              Description
              <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Auto-detected from the website metadata" />
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
            {boostProject ? "Boost Amount" : "Initial Bid"}
            <input value={bid} onChange={(event) => setBid(event.target.value)} inputMode="numeric" />
          </label>
          {boostProject && currentBoostTotal ? (
            <p className="field-help">
              This adds to the current bid. Final total: {formatWholeUsdt(currentBoostTotal + (parseWholeUsdtInput(bid) ?? BigInt(0)))}.
            </p>
          ) : null}
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
