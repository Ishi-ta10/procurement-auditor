import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api/client";

export function useHealth() {
  return useQuery({
    queryKey: ["health"],
    queryFn: api.health,
    refetchInterval: 15000,
    retry: 0,
  });
}

export function useDashboardSummary() {
  return useQuery({
    queryKey: ["dashboard-summary"],
    queryFn: api.getDashboardSummary,
    refetchInterval: 5000,
  });
}

export function useInvoices(status) {
  return useQuery({
    queryKey: ["invoices", status ?? "all"],
    queryFn: () => api.getInvoices(status),
    refetchInterval: 5000,
  });
}

export function useInvoice(id) {
  return useQuery({
    queryKey: ["invoice", id],
    queryFn: () => api.getInvoice(id),
    enabled: !!id,
  });
}

// Polls the lightweight status endpoint until the invoice leaves pending/processing.
export function useInvoiceStatus(id, enabled) {
  return useQuery({
    queryKey: ["invoice-status", id],
    queryFn: () => api.getInvoiceStatus(id),
    enabled: !!id && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && status !== "pending" && status !== "processing") return false;
      return 2000;
    },
  });
}

export function usePurchaseOrders() {
  return useQuery({
    queryKey: ["purchase-orders"],
    queryFn: api.getPurchaseOrders,
  });
}

export function useUploadInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (file) => api.uploadInvoice(file),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useOverrideInvoice(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (decision) => api.overrideInvoice(id, decision),
    onSuccess: (data) => {
      qc.setQueryData(["invoice", id], data);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useApproveInvoice(id) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.approveInvoice(id),
    onSuccess: (data) => {
      qc.setQueryData(["invoice", id], data);
      qc.invalidateQueries({ queryKey: ["invoices"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}

export function useRetrainModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.retrainModel(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
  });
}
