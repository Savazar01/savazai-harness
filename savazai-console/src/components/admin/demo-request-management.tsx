"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  CalendarCheck,
  Search,
  RefreshCw,
  Trash2,
  Edit3,
  Mail,
  Phone,
  Building2,
  Clock,
  Briefcase,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  X,
  Loader2,
  Filter,
  ExternalLink,
  ChevronRight,
  Sparkles,
  Inbox,
  UserCheck,
  Archive,
  Save,
  Check
} from "lucide-react";

export interface DemoRequest {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  industry: string;
  timeline: string;
  description: string;
  status: "pending" | "contacted" | "scheduled" | "completed" | "archived";
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; bg: string; text: string; border: string }
> = {
  pending: {
    label: "Pending Review",
    bg: "bg-amber-500/15",
    text: "text-amber-300",
    border: "border-amber-500/30",
  },
  contacted: {
    label: "Contacted",
    bg: "bg-blue-500/15",
    text: "text-blue-300",
    border: "border-blue-500/30",
  },
  scheduled: {
    label: "Demo Scheduled",
    bg: "bg-purple-500/15",
    text: "text-purple-300",
    border: "border-purple-500/30",
  },
  completed: {
    label: "Completed",
    bg: "bg-emerald-500/15",
    text: "text-emerald-300",
    border: "border-emerald-500/30",
  },
  archived: {
    label: "Archived",
    bg: "bg-slate-800/60",
    text: "text-slate-400",
    border: "border-slate-700",
  },
};

export function DemoRequestManagement() {
  const [mounted, setMounted] = useState(false);
  const [requests, setRequests] = useState<DemoRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Management Modal state
  const [selectedRequest, setSelectedRequest] = useState<DemoRequest | null>(null);
  const [modalStatus, setModalStatus] = useState<string>("pending");
  const [modalNotes, setModalNotes] = useState<string>("");
  const [savingNotes, setSavingNotes] = useState(false);

  // Delete Dialog state
  const [deleteTarget, setDeleteTarget] = useState<DemoRequest | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchRequests = useCallback(async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const res = await fetch("/api/admin/demo-requests");
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setRequests(data.demoRequests || []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load demo requests.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  // Flash message clear
  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => setSuccessMessage(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  const filteredRequests = useMemo(() => {
    return requests.filter((r) => {
      const matchesStatus = statusFilter === "all" || r.status === statusFilter;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        r.fullName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.company.toLowerCase().includes(q) ||
        r.industry.toLowerCase().includes(q);
      return matchesStatus && matchesSearch;
    });
  }, [requests, statusFilter, searchQuery]);

  // Metrics computation
  const metrics = useMemo(() => {
    const total = requests.length;
    const pending = requests.filter((r) => r.status === "pending").length;
    const scheduled = requests.filter((r) => r.status === "scheduled").length;
    const completed = requests.filter((r) => r.status === "completed").length;
    return { total, pending, scheduled, completed };
  }, [requests]);

  const handleOpenDetail = (req: DemoRequest) => {
    setSelectedRequest(req);
    setModalStatus(req.status);
    setModalNotes(req.notes || "");
  };

  const handleSaveDetails = async () => {
    if (!selectedRequest) return;
    try {
      setSavingNotes(true);
      const res = await fetch(`/api/admin/demo-requests/${selectedRequest.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: modalStatus,
          notes: modalNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to update demo request.");
      }

      setRequests((prev) =>
        prev.map((r) => (r.id === selectedRequest.id ? data.demoRequest : r))
      );
      setSelectedRequest(null);
      setSuccessMessage("Inbound lead details updated successfully.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to update details.";
      setErrorMessage(msg);
    } finally {
      setSavingNotes(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/admin/demo-requests/${deleteTarget.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to delete demo request.");
      }

      setRequests((prev) => prev.filter((r) => r.id !== deleteTarget.id));
      if (selectedRequest?.id === deleteTarget.id) {
        setSelectedRequest(null);
      }
      setDeleteTarget(null);
      setSuccessMessage("Demo request record removed.");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to delete record.";
      setErrorMessage(msg);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-950 text-slate-100 overflow-hidden">
      {/* Header Bar */}
      <div className="shrink-0 border-b border-slate-900 bg-slate-950/90 px-6 py-5 backdrop-blur-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <CalendarCheck className="h-4 w-4" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
                Inbound Demo Requests &amp; Leads
              </h1>
              <p className="text-slate-400 text-xs">
                Track, coordinate, and manage prospective enterprise customer demo inquiries
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchRequests}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 transition-all disabled:opacity-50"
            title="Refresh Inbound Leads"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Main Workspace */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-800">
        {/* Flash Notifications */}
        {errorMessage && (
          <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-300 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-400 shrink-0" />
              <span>{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {successMessage && (
          <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs font-medium flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <span>{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)}>
              <X className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Metrics Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-5 rounded-2xl border border-slate-850 bg-slate-900/30 space-y-1">
            <div className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
              <Inbox className="h-3.5 w-3.5 text-slate-400" />
              Total Inquiries
            </div>
            <div className="text-2xl font-extrabold text-white">{metrics.total}</div>
          </div>

          <div className="p-5 rounded-2xl border border-amber-500/20 bg-amber-950/10 space-y-1">
            <div className="text-xs font-medium text-amber-300 flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-400" />
              Pending Review
            </div>
            <div className="text-2xl font-extrabold text-amber-200">{metrics.pending}</div>
          </div>

          <div className="p-5 rounded-2xl border border-purple-500/20 bg-purple-950/10 space-y-1">
            <div className="text-xs font-medium text-purple-300 flex items-center gap-1.5">
              <CalendarCheck className="h-3.5 w-3.5 text-purple-400" />
              Scheduled Demos
            </div>
            <div className="text-2xl font-extrabold text-purple-200">{metrics.scheduled}</div>
          </div>

          <div className="p-5 rounded-2xl border border-emerald-500/20 bg-emerald-950/10 space-y-1">
            <div className="text-xs font-medium text-emerald-300 flex items-center gap-1.5">
              <UserCheck className="h-3.5 w-3.5 text-emerald-400" />
              Completed / Won
            </div>
            <div className="text-2xl font-extrabold text-emerald-200">{metrics.completed}</div>
          </div>
        </div>

        {/* Filters & Search Controls */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-4 rounded-2xl border border-slate-900 bg-slate-900/20">
          {/* Status Tabs */}
          <div className="flex flex-wrap items-center gap-1.5">
            {[
              { id: "all", label: "All Leads" },
              { id: "pending", label: "Pending" },
              { id: "contacted", label: "Contacted" },
              { id: "scheduled", label: "Scheduled" },
              { id: "completed", label: "Completed" },
              { id: "archived", label: "Archived" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                  statusFilter === tab.id
                    ? "bg-primary text-white shadow-md shadow-primary/20"
                    : "text-slate-400 hover:text-slate-200 hover:bg-slate-850"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search Bar */}
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, company, email..."
              className="w-full pl-9 pr-8 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Leads Data Table */}
        <div className="rounded-3xl border border-slate-900 bg-slate-900/20 overflow-hidden">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 space-y-3">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
              <p className="text-xs">Loading inbound demo requests...</p>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-slate-400 text-center space-y-2">
              <Inbox className="h-10 w-10 text-slate-600 mb-1" />
              <h3 className="text-sm font-bold text-white">No Demo Requests Found</h3>
              <p className="text-xs text-slate-500 max-w-sm">
                {searchQuery || statusFilter !== "all"
                  ? "Try resetting your search filters or status selection."
                  : "Prospective customer demo requests submitted on the landing page will appear here."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-900/80 text-slate-300 font-semibold border-b border-slate-800">
                  <tr>
                    <th className="px-5 py-4">Prospective Lead &amp; Company</th>
                    <th className="px-5 py-4">Contact Info</th>
                    <th className="px-5 py-4">Industry &amp; Timeline</th>
                    <th className="px-5 py-4">Status</th>
                    <th className="px-5 py-4">Submitted</th>
                    <th className="px-5 py-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-900 text-slate-300">
                  {filteredRequests.map((req) => {
                    const statusConf = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending;
                    return (
                      <tr
                        key={req.id}
                        className="hover:bg-slate-850/40 transition-colors group cursor-pointer"
                        onClick={() => handleOpenDetail(req)}
                      >
                        {/* Name & Company */}
                        <td className="px-5 py-4">
                          <div className="font-bold text-white group-hover:text-primary transition-colors">
                            {req.fullName}
                          </div>
                          <div className="text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <Building2 className="h-3 w-3 text-slate-500" />
                            {req.company}
                          </div>
                        </td>

                        {/* Contact */}
                        <td className="px-5 py-4 space-y-0.5">
                          <div className="flex items-center gap-1.5 text-slate-300">
                            <Mail className="h-3 w-3 text-slate-500" />
                            <a
                              href={`mailto:${req.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary transition-colors"
                            >
                              {req.email}
                            </a>
                          </div>
                          <div className="flex items-center gap-1.5 text-slate-400">
                            <Phone className="h-3 w-3 text-slate-500" />
                            <a
                              href={`tel:${req.phone}`}
                              onClick={(e) => e.stopPropagation()}
                              className="hover:text-primary transition-colors"
                            >
                              {req.phone}
                            </a>
                          </div>
                        </td>

                        {/* Industry & Timeline */}
                        <td className="px-5 py-4 space-y-0.5">
                          <div className="font-medium text-slate-200">{req.industry}</div>
                          <div className="text-slate-400 flex items-center gap-1 text-[11px]">
                            <Clock className="h-3 w-3 text-slate-500" />
                            {req.timeline}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold border ${statusConf.bg} ${statusConf.text} ${statusConf.border}`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {statusConf.label}
                          </span>
                        </td>

                        {/* Submitted Date */}
                        <td className="px-5 py-4 text-slate-400 text-[11px]">
                          {new Date(req.createdAt).toLocaleDateString(undefined, {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </td>

                        {/* Actions */}
                        <td className="px-5 py-4 text-right">
                          <div
                            className="flex items-center justify-end gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleOpenDetail(req)}
                              className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700 text-xs font-semibold transition-all"
                            >
                              Manage
                            </button>
                            <button
                              onClick={() => setDeleteTarget(req)}
                              className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                              title="Delete Record"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Lead Detail & Management Modal */}
      {mounted && selectedRequest && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-800 bg-slate-900 shadow-2xl p-6 sm:p-8 text-slate-100 flex flex-col max-h-[90vh] overflow-hidden my-auto">
            {/* Close Button */}
            <button
              onClick={() => setSelectedRequest(null)}
              className="absolute top-5 right-5 p-2 text-slate-400 hover:text-white rounded-full hover:bg-slate-800 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Header */}
            <div className="mb-6 space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-500/10 text-purple-300 border border-purple-500/20">
                <CalendarCheck className="h-3.5 w-3.5" />
                Inbound Lead Profile
              </div>
              <h2 className="text-2xl font-bold text-white">
                {selectedRequest.fullName}
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5 text-slate-400" />
                {selectedRequest.company} &bull; Submitted on{" "}
                {new Date(selectedRequest.createdAt).toLocaleString()}
              </p>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto space-y-5 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-slate-800">
              {/* Quick Contact & Info Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-2xl border border-slate-800 bg-slate-950/60">
                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Business Email
                  </div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5 text-slate-400" />
                    <a
                      href={`mailto:${selectedRequest.email}`}
                      className="hover:text-primary transition-colors underline"
                    >
                      {selectedRequest.email}
                    </a>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Phone Number
                  </div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5 text-slate-400" />
                    <a
                      href={`tel:${selectedRequest.phone}`}
                      className="hover:text-primary transition-colors underline"
                    >
                      {selectedRequest.phone}
                    </a>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Industry Domain
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {selectedRequest.industry}
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                    Target Timeline
                  </div>
                  <div className="text-xs font-semibold text-white">
                    {selectedRequest.timeline}
                  </div>
                </div>
              </div>

              {/* Workflow Goals Description */}
              <div className="space-y-1.5">
                <div className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                  Workflow &amp; Use Case Requirements
                </div>
                <div className="p-4 rounded-2xl border border-slate-800 bg-slate-950/80 text-xs text-slate-300 leading-relaxed whitespace-pre-wrap">
                  {selectedRequest.description}
                </div>
              </div>

              {/* Status Update & Internal Notes */}
              <div className="space-y-4 pt-2 border-t border-slate-800">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-slate-400" />
                    Inquiry Lifecycle Status
                  </label>
                  <select
                    value={modalStatus}
                    onChange={(e) => setModalStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all"
                  >
                    <option value="pending">Pending Review</option>
                    <option value="contacted">Contacted / In Discussion</option>
                    <option value="scheduled">Demo Scheduled</option>
                    <option value="completed">Completed / Customer Won</option>
                    <option value="archived">Archived / Closed</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Edit3 className="h-3.5 w-3.5 text-slate-400" />
                    Internal Admin Follow-Up Notes
                  </label>
                  <textarea
                    rows={3}
                    value={modalNotes}
                    onChange={(e) => setModalNotes(e.target.value)}
                    placeholder="Add private notes for the sales & solutions team (e.g. Scheduled demo for Thursday at 2pm EST)..."
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer Action Buttons */}
            <div className="pt-5 border-t border-slate-800 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setDeleteTarget(selectedRequest)}
                className="px-4 py-2.5 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 text-xs font-semibold transition-all"
              >
                Delete Lead
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedRequest(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveDetails}
                  disabled={savingNotes}
                  className="flex items-center gap-1.5 px-6 py-2.5 rounded-xl bg-primary text-white text-xs font-semibold shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all disabled:opacity-50"
                >
                  {savingNotes ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="h-3.5 w-3.5" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Delete Confirmation Dialog */}
      {mounted && deleteTarget && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-rose-500/30 bg-slate-900 p-6 text-slate-100 space-y-4 shadow-2xl my-auto">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-400 border border-rose-500/20">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Delete Lead Inquiry</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete the demo request record for{" "}
              <strong className="text-white">{deleteTarget.fullName}</strong> (
              {deleteTarget.company})?
            </p>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 text-xs font-semibold transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-xs font-semibold shadow-lg shadow-rose-600/20 hover:bg-rose-500 transition-all disabled:opacity-50 flex items-center gap-1.5"
              >
                {deleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Confirm Delete
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
