"use client";

import { Minus, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { MAX_BID_USDT, MIN_BID_USDT } from "@/lib/domain/money";

const minBid = Number(MIN_BID_USDT);
const maxBid = Number(MAX_BID_USDT);
const usdtFormatter = new Intl.NumberFormat("en-US");

function normalizeAmount(value: string) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return minBid;
  }

  return Math.min(maxBid, Math.max(minBid, parsed));
}

export function ClaimAmountControl({
  initialAmount,
  formId,
}: {
  initialAmount: string;
  formId: string;
}) {
  const [amount, setAmount] = useState(() => normalizeAmount(initialAmount));
  const formattedAmount = useMemo(() => usdtFormatter.format(amount), [amount]);

  function updateAmount(delta: number) {
    setAmount((current) => Math.min(maxBid, Math.max(minBid, current + delta)));
  }

  return (
    <>
      <h1>
        Claim #1 for
        <span className="title-price-control">
          <button
            type="button"
            aria-label="Decrease claim amount"
            disabled={amount <= minBid}
            onClick={() => updateAmount(-1)}
          >
            <Minus size={16} />
          </button>
          <span aria-live="polite">{formattedAmount} USDT</span>
          <button
            type="button"
            aria-label="Increase claim amount"
            disabled={amount >= maxBid}
            onClick={() => updateAmount(1)}
          >
            <Plus size={16} />
          </button>
        </span>
      </h1>
      <input type="hidden" form={formId} name="target" value={amount.toString()} />
    </>
  );
}
