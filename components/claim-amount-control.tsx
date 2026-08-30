"use client";

import { Minus, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MIN_BID_USDT } from "@/lib/domain/money";

const usdtFormatter = new Intl.NumberFormat("en-US");
const categoryChangeEvent = "chainbid:category-change";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function normalizedAmount(value: string) {
  const digits = digitsOnly(value);
  if (!digits) {
    return MIN_BID_USDT;
  }

  const amount = BigInt(digits);
  return amount < MIN_BID_USDT ? MIN_BID_USDT : amount;
}

function normalizedAmountText(value: string) {
  return normalizedAmount(value).toString();
}

export function ClaimAmountControl({
  initialAmount,
  formId,
  categoryAmounts = {},
}: {
  initialAmount: string;
  formId: string;
  categoryAmounts?: Record<string, string>;
}) {
  const [amount, setAmount] = useState(() => normalizedAmountText(initialAmount));
  const normalized = useMemo(() => normalizedAmount(amount), [amount]);
  const formattedAmount = useMemo(() => usdtFormatter.format(normalized), [normalized]);

  useEffect(() => {
    function handleCategoryChange(event: Event) {
      const category = (event as CustomEvent<{ category?: string }>).detail?.category;
      const nextAmount = category ? categoryAmounts[category] : null;

      if (!nextAmount) {
        return;
      }

      setAmount(normalizedAmountText(nextAmount));
    }

    window.addEventListener(categoryChangeEvent, handleCategoryChange);

    return () => {
      window.removeEventListener(categoryChangeEvent, handleCategoryChange);
    };
  }, [categoryAmounts]);

  function updateAmount(delta: bigint) {
    setAmount((current) => {
      const next = normalizedAmount(current) + delta;
      return (next < MIN_BID_USDT ? MIN_BID_USDT : next).toString();
    });
  }

  return (
    <>
      <h1>
        Claim #1 for
        <span className="title-price-control">
          <button
            type="button"
            aria-label="Decrease claim amount"
            disabled={normalized <= MIN_BID_USDT}
            onClick={() => updateAmount(BigInt(-1))}
          >
            <Minus size={16} />
          </button>
          <span className="claim-amount-field" aria-live="polite" aria-label={`${formattedAmount} USDT`}>
            <input
              aria-label="Custom claim amount in USDT"
              className="claim-amount-input"
              inputMode="numeric"
              pattern="[0-9]*"
              style={{ width: `${Math.min(Math.max(amount.length, 2), 9)}ch` }}
              value={amount}
              onBlur={() => setAmount(normalizedAmountText(amount))}
              onChange={(event) => setAmount(digitsOnly(event.target.value))}
            />
            <span className="claim-amount-unit">USDT</span>
          </span>
          <button
            type="button"
            aria-label="Increase claim amount"
            onClick={() => updateAmount(BigInt(1))}
          >
            <Plus size={16} />
          </button>
        </span>
      </h1>
      <input type="hidden" form={formId} name="target" value={normalized.toString()} />
    </>
  );
}
