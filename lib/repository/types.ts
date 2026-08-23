import type {
  ActivityEventRecord,
  BidRecord,
  LeaderboardEntry,
  PaymentOrderRecord,
  PaymentOrderStatus,
  ProjectRecord,
  SupportedNetwork,
} from "@/lib/domain/types";
import type { PaymentOrderDraft, VerificationResult } from "@/lib/payment/types";

export interface CreateProjectInput {
  canonicalListingKey: string;
  slug: string;
  name: string;
  url: string;
  description: string;
  logoUrl?: string | null;
  xUrl?: string | null;
  category: string;
}

export interface Repository {
  getLeaderboard(category?: string): Promise<LeaderboardEntry[]>;
  getActivity(limit?: number): Promise<ActivityEventRecord[]>;
  getProjectBySlug(slug: string): Promise<ProjectRecord | null>;
  getProjectById(id: string): Promise<ProjectRecord | null>;
  findProjectByCanonicalKey(key: string): Promise<ProjectRecord | null>;
  createProject(input: CreateProjectInput): Promise<ProjectRecord>;
  listBidsForProject(projectId: string): Promise<BidRecord[]>;
  createPaymentOrder(draft: PaymentOrderDraft): Promise<PaymentOrderRecord>;
  getPaymentOrder(publicId: string): Promise<PaymentOrderRecord | null>;
  listOpenPaymentOrders(args: {
    statuses: PaymentOrderStatus[];
    limit: number;
  }): Promise<PaymentOrderRecord[]>;
  recordVerification(
    publicId: string,
    result: VerificationResult,
    nextStatus: PaymentOrderStatus,
  ): Promise<PaymentOrderRecord | null>;
  creditPaymentOrder(publicId: string): Promise<{
    credited: boolean;
    order: PaymentOrderRecord | null;
    bid: BidRecord | null;
    result?: VerificationResult;
  }>;
  recordClick(projectId: string, requestMeta: { ipHash: string; userAgent: string }): Promise<string | null>;
  adminSnapshot(): Promise<{
    projects: ProjectRecord[];
    payments: PaymentOrderRecord[];
    activity: ActivityEventRecord[];
    networks: SupportedNetwork[];
  }>;
}
