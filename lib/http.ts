import { ZodError, type ZodIssue } from "zod";

const fieldLabels: Record<string, string> = {
  "project.url": "Project URL",
  "project.name": "Project name",
  "project.description": "Description",
  "project.category": "Category",
  url: "Project URL",
  name: "Project name",
  description: "Description",
  category: "Category",
  network: "Network",
  bidTotalUsdt: "Bid amount",
  expectedSenderAddress: "Paying wallet",
  txHash: "Transaction hash",
};

export function jsonError(message: string, status = 400) {
  return Response.json({ error: message }, { status });
}

function fieldLabel(issue: ZodIssue) {
  const path = issue.path.join(".");
  return fieldLabels[path] ?? fieldLabels[path.replace(/^project\./, "")] ?? "This field";
}

function zodIssueMessage(issue: ZodIssue) {
  const label = fieldLabel(issue);
  const path = issue.path.join(".");

  if (issue.code === "too_small" && issue.origin === "string") {
    if (path === "project.url" || path === "url") {
      return "Enter a project URL.";
    }
    if (path === "project.name" || path === "name") {
      return "Enter a project name.";
    }
    if (path === "project.description" || path === "description") {
      return "Write a short project description of at least 10 characters.";
    }
    if (path === "txHash") {
      return "Enter a valid transaction hash.";
    }
    return `${label} is too short.`;
  }

  if (issue.code === "too_big" && issue.origin === "string") {
    return `${label} is too long.`;
  }

  if (issue.code === "invalid_value") {
    if (path === "network") {
      return "Choose a supported USDT network.";
    }
    if (path === "project.category" || path === "category") {
      return "Choose a supported project category.";
    }
  }

  if (issue.code === "invalid_type") {
    return `${label} is required.`;
  }

  return `${label}: ${issue.message}`;
}

function zodErrorMessage(error: ZodError) {
  const messages = [...new Set(error.issues.map(zodIssueMessage))];
  return messages.length ? messages.join(" ") : "Check the form and try again.";
}

export function errorMessage(error: unknown) {
  if (error instanceof ZodError) {
    return zodErrorMessage(error);
  }

  if (error instanceof Error) {
    return error.message;
  }

  return "Unexpected error";
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch {
    throw new Error("Request body must be valid JSON.");
  }
}

export function hashRequestIp(request: Request) {
  const ip =
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown";

  let hash = 0;
  for (const char of ip) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }

  return hash.toString(16);
}
