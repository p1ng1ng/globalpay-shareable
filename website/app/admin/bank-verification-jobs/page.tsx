"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, RefreshCw, SearchCheck } from "lucide-react";

type VerificationJob = {
  jobId: string;
  transactionId: string;
  paymentLinkId: string;
  merchantEmail: string;
  bankRailId: string;
  utr: string;
  expectedAmount: number;
  status: string;
  attemptCount: number;
  lastError: string;
  createdAt?: string;
};

export default function AdminBankVerificationJobsPage() {
  const [jobs, setJobs] = useState<VerificationJob[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState("");

  async function loadJobs() {
    setLoading(true);
    setMessage("");
    try {
      const response = await fetch("/api/admin/bank-verification-jobs", {
        cache: "no-store",
        credentials: "include",
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Failed to load verification jobs");
      }
      setJobs(data.jobs || []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to load verification jobs");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadJobs();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  async function postAction(job: VerificationJob, action: "mark-matched" | "mark-review") {
    setBusyId(job.jobId);
    setMessage("");
    try {
      const note =
        action === "mark-matched"
          ? window.prompt("Admin note for verified UTR:", "Statement checked") || ""
          : window.prompt("Reason for manual review:", "Needs manual review") || "";
      if (!note) return;
      const response = await fetch(`/api/admin/bank-verification-jobs/${job.jobId}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ note }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Action failed");
      }
      setMessage(data.message || "Verification job updated");
      await loadJobs();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main>
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <p className="text-sm font-black uppercase tracking-[0.24em] text-emerald-600">
              UTR verification
            </p>
            <h1 className="mt-3 text-4xl font-black">Bank Verification Jobs</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-gray-600">
              Review UTR submissions from bank rail Paybook payments and confirm verified credits.
            </p>
          </div>
          <button
            onClick={loadJobs}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-3 text-sm font-black hover:bg-blue-700"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        </header>

        {message ? (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-bold text-blue-100">
            {message}
          </div>
        ) : null}

        <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="bg-gray-50 text-xs uppercase tracking-[0.14em] text-gray-500">
              <tr>
                <th className="px-4 py-4">Transaction</th>
                <th className="px-4 py-4">Merchant</th>
                <th className="px-4 py-4">UTR</th>
                <th className="px-4 py-4">Amount</th>
                <th className="px-4 py-4">Status</th>
                <th className="px-4 py-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td className="px-4 py-8 text-gray-600" colSpan={6}>Loading verification jobs...</td></tr>
              ) : jobs.length === 0 ? (
                <tr><td className="px-4 py-8 text-gray-600" colSpan={6}>No verification jobs found.</td></tr>
              ) : (
                jobs.map((job) => (
                  <tr key={job.jobId} className="border-t border-gray-200">
                    <td className="px-4 py-4">
                      <p className="font-mono font-bold">{job.transactionId}</p>
                      <p className="text-xs text-gray-500">{job.paymentLinkId}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-700">{job.merchantEmail}</td>
                    <td className="px-4 py-4 font-mono text-blue-700">{job.utr}</td>
                    <td className="px-4 py-4 text-gray-700">INR {job.expectedAmount}</td>
                    <td className="px-4 py-4">
                      <span className="rounded bg-gray-50 px-2 py-1 text-xs font-black text-gray-700">
                        {job.status}
                      </span>
                      {job.lastError ? <p className="mt-2 text-xs text-red-700">{job.lastError}</p> : null}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => postAction(job, "mark-matched")}
                          disabled={busyId === job.jobId || job.status === "matched"}
                          className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-gray-900 hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          Match
                        </button>
                        <button
                          onClick={() => postAction(job, "mark-review")}
                          disabled={busyId === job.jobId}
                          className="inline-flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-2 text-xs font-black text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                        >
                          <SearchCheck className="h-4 w-4" />
                          Review
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}


