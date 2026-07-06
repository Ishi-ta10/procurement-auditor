// Thin fetch wrapper.
// - In development, requests go through the Vite /api proxy to the FastAPI backend.
// - In production, set VITE_API_BASE_URL at build time to point directly at the
//   deployed backend (e.g. https://your-api.onrender.com), or leave it unset and
//   let the hosting platform proxy /api/* to the backend (see frontend/vercel.json).
const BASE = import.meta.env.VITE_API_BASE_URL || "/api";

async function request(path, options = {}) {
  const res = await fetch(`${BASE}${path}`, options);
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.detail) message = body.detail;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new Error(message);
  }
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  health: () => request("/health"),
  getDashboardSummary: () => request("/dashboard/summary"),
  getInvoices: (status) =>
    request(`/invoices${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  getInvoice: (id) => request(`/invoices/${id}`),
  getInvoiceStatus: (id) => request(`/invoices/${id}/status`),
  getPurchaseOrders: () => request("/purchase-orders"),
  uploadInvoice: (file) => {
    const form = new FormData();
    form.append("file", file);
    return request("/upload-invoice", { method: "POST", body: form });
  },
  overrideInvoice: (id, decision) =>
    request(`/invoices/${id}/override`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    }),
  approveInvoice: (id) => request(`/invoices/${id}/approve`, { method: "POST" }),
  retrainModel: () => request("/model/retrain"),
};
