import { headers } from "next/headers";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { isAdminHeaders } from "@/lib/admin-auth";
import { getNetworkConfigs } from "@/lib/config/networks";
import { formatUsdt } from "@/lib/domain/money";
import { getRepository } from "@/lib/repository";

export const metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

export default async function AdminPage() {
  const requestHeaders = await headers();
  const allowed = isAdminHeaders(requestHeaders);

  if (!allowed) {
    return (
      <main className="site-shell subpage-shell">
        <section className="form-panel narrow-panel">
          <ShieldAlert size={32} />
          <h1>Admin protected</h1>
          <p className="muted-copy">
            Configure ADMIN_TOKEN and send it in the x-admin-token header or admin_token cookie.
          </p>
        </section>
      </main>
    );
  }

  const snapshot = await getRepository().adminSnapshot();
  const networks = getNetworkConfigs();
  const paymentCounts = snapshot.payments.reduce<Record<string, number>>((counts, payment) => {
    counts[payment.status] = (counts[payment.status] ?? 0) + 1;
    return counts;
  }, {});

  return (
    <main className="site-shell subpage-shell">
      <section className="admin-grid">
        <div className="admin-header">
          <p className="eyebrow">ADMIN</p>
          <h1>Operations dashboard</h1>
        </div>
        <div className="admin-card">
          <ShieldCheck size={22} />
          <span>Projects</span>
          <strong>{snapshot.projects.length}</strong>
        </div>
        <div className="admin-card">
          <ShieldCheck size={22} />
          <span>Open Payments</span>
          <strong>
            {(paymentCounts.waiting ?? 0) + (paymentCounts.detected ?? 0) + (paymentCounts.confirming ?? 0)}
          </strong>
        </div>
        <div className="admin-card">
          <ShieldAlert size={22} />
          <span>Manual Review</span>
          <strong>{paymentCounts.manual_review ?? 0}</strong>
        </div>
      </section>

      <section className="admin-columns">
        <div className="history-panel">
          <h2>Payments</h2>
          {[
            "waiting",
            "detected",
            "confirming",
            "confirmed",
            "credited",
            "expired",
            "underpaid",
            "overpaid",
            "manual_review",
            "failed",
          ].map((status) => (
            <div className="history-row" key={status}>
              <span>{status}</span>
              <small>{paymentCounts[status] ?? 0}</small>
            </div>
          ))}
        </div>
        <div className="history-panel">
          <h2>Networks</h2>
          {networks.map((network) => (
            <div className="history-row" key={network.network}>
              <span>{network.label}</span>
              <small>{network.enabled ? "enabled" : "disabled"} / {network.sourceStatus}</small>
            </div>
          ))}
        </div>
        <div className="history-panel">
          <h2>Top Projects</h2>
          {snapshot.projects.slice(0, 8).map((project) => (
            <div className="history-row" key={project.id}>
              <span>{project.name}</span>
              <small>{formatUsdt(project.totalBidUsdt)}</small>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
