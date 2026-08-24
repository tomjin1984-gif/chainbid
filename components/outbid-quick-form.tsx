"use client";

import { ArrowRight, CheckCircle2 } from "lucide-react";
import { useState } from "react";
import type { FormEvent } from "react";
import { CategoryDropdown } from "@/components/category-dropdown";
import type { SupportedNetwork } from "@/lib/domain/types";

export function OutbidQuickForm({
  formId,
  defaultCategory = "DeFi",
  network,
}: {
  formId: string;
  defaultCategory?: string;
  network: SupportedNetwork;
}) {
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

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
        <button className="button outbid-submit-button" type="submit" disabled={busy}>
          {busy ? "Creating" : "Outbid"}
          {busy ? <CheckCircle2 size={18} /> : <ArrowRight size={18} />}
        </button>
      </form>
      {status ? <p className="outbid-form-status">{status}</p> : null}
    </>
  );
}
