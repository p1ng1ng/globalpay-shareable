export default function MerchantSupportPage() {
  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <a href="/merchant/dashboard" className="text-sm font-semibold text-blue-600">← Back to Dashboard</a>
      <h1 className="text-3xl font-bold text-slate-900 mt-4">Support</h1>
      <p className="text-slate-500 mt-1">Create support tickets for payment, refund or settlement issues.</p>

      <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm space-y-4">
        <input className="w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Ticket Subject" />
        <select className="w-full rounded-xl border border-slate-300 px-4 py-3">
          <option>Payment Issue</option>
          <option>Account Issue</option>
          <option>Settlement Issue</option>
          <option>Refund Issue</option>
        </select>
        <textarea className="w-full rounded-xl border border-slate-300 px-4 py-3" placeholder="Message" rows={5}></textarea>
        <button className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white">Create Ticket</button>
      </div>
    </main>
  );
}
