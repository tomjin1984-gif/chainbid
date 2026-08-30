"use client";

import { Check, ChevronDown, ShieldCheck } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categories } from "@/lib/seed";

const categoryOptions = categories.filter((category) => category !== "All");
const categoryChangeEvent = "chainbid:category-change";

export function CategoryDropdown({
  defaultValue = "DeFi",
  onChange,
}: {
  defaultValue?: string;
  onChange?: (category: string) => void;
}) {
  const [selected, setSelected] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleCategoryChange(event: Event) {
      const category = (event as CustomEvent<{ category?: string }>).detail?.category;
      if (category && category !== "All" && categoryOptions.includes(category as never)) {
        setSelected(category);
      }
    }

    function handlePointerDown(event: PointerEvent) {
      if (!dropdownRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener(categoryChangeEvent, handleCategoryChange);
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener(categoryChangeEvent, handleCategoryChange);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  return (
    <div className="category-dropdown" ref={dropdownRef}>
      <input type="hidden" name="category" value={selected} />
      <button
        aria-expanded={open}
        aria-haspopup="listbox"
        className="category-dropdown-trigger"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <ShieldCheck size={17} aria-hidden="true" />
        <span>{selected}</span>
        <ChevronDown className={open ? "dropdown-chevron dropdown-chevron-open" : "dropdown-chevron"} size={18} aria-hidden="true" />
      </button>

      {open ? (
        <div className="category-dropdown-card" role="listbox" aria-label="Category">
          {categoryOptions.map((category) => {
            const active = category === selected;

            return (
              <button
                aria-selected={active}
                className={active ? "category-dropdown-option active" : "category-dropdown-option"}
                key={category}
                onClick={() => {
                  setSelected(category);
                  onChange?.(category);
                  setOpen(false);
                }}
                role="option"
                type="button"
              >
                <span>{category}</span>
                {active ? <Check size={15} aria-hidden="true" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
