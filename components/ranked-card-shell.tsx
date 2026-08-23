"use client";

import type { KeyboardEvent, MouseEvent, PropsWithChildren } from "react";

type RankedCardShellProps = PropsWithChildren<{
  className: string;
  href: string;
  label: string;
}>;

function isCardControl(target: EventTarget | null) {
  return target instanceof Element
    ? Boolean(target.closest("[data-card-action], [data-card-main-link]"))
    : false;
}

export function RankedCardShell({ children, className, href, label }: RankedCardShellProps) {
  function openProject() {
    const openedWindow = window.open(href, "_blank", "noopener,noreferrer");
    if (!openedWindow) {
      window.location.assign(href);
    }
  }

  function handleClick(event: MouseEvent<HTMLDivElement>) {
    if (isCardControl(event.target)) {
      return;
    }

    openProject();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    openProject();
  }

  return (
    <div
      aria-label={label}
      className={className}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="link"
      tabIndex={0}
    >
      {children}
    </div>
  );
}
