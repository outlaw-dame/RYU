/**
 * Report flow - create and manage reports against accounts.
 *
 * Supports:
 * - Account ID targeting
 * - Status IDs as evidence
 * - User-provided comment
 * - Category selection (spam, violation, legal, other)
 * - Rule IDs for specific violations
 * - Forward to remote instance admins
 */

import type { PolicyReport, ReportCategory, ReportStatus } from "./policy-types";

// ─── Types ────────────────────────────────────────────────────────────────────

export type CreateReportParams = {
  /** The account ID being reported. */
  targetAccountId: string;
  /** Status IDs to attach as evidence. */
  statusIds?: string[];
  /** User comment explaining the report. */
  comment: string;
  /** Report category. */
  category: ReportCategory;
  /** Rule IDs that were violated. */
  ruleIds?: string[];
  /** Whether to forward to the remote instance admin. */
  forward?: boolean;
  /** Instance origin for the report submission. */
  instanceOrigin?: string;
  /** Account ID of the reporter. */
  accountId?: string;
};

export type SubmitReportResult = {
  success: boolean;
  report: PolicyReport;
  remoteId?: string;
  error?: string;
};

// ─── Report Creation ──────────────────────────────────────────────────────────

let reportCounter = 0;

function generateReportId(): string {
  reportCounter += 1;
  return `report-${Date.now()}-${reportCounter}`;
}

/**
 * Create a new report (draft state).
 */
export function createReport(params: CreateReportParams): PolicyReport {
  const now = new Date().toISOString();
  return {
    id: generateReportId(),
    targetAccountId: params.targetAccountId,
    statusIds: params.statusIds ?? [],
    comment: params.comment.trim(),
    category: params.category,
    ruleIds: params.ruleIds ?? [],
    forward: params.forward ?? false,
    status: "draft",
    instanceOrigin: params.instanceOrigin,
    accountId: params.accountId,
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Validate a report before submission.
 */
export function validateReport(report: PolicyReport): string[] {
  const errors: string[] = [];

  if (!report.targetAccountId.trim()) {
    errors.push("Target account ID is required");
  }

  if (!report.comment.trim()) {
    errors.push("Comment is required");
  }

  if (report.comment.length > 1000) {
    errors.push("Comment must be 1000 characters or fewer");
  }

  if (report.statusIds.length > 20) {
    errors.push("Maximum 20 status IDs per report");
  }

  const validCategories: ReportCategory[] = ["spam", "violation", "legal", "other"];
  if (!validCategories.includes(report.category)) {
    errors.push("Invalid report category");
  }

  return errors;
}

/**
 * Mark a report as submitted with a remote ID.
 */
export function markReportSubmitted(report: PolicyReport, remoteId: string): PolicyReport {
  return {
    ...report,
    status: "submitted" as ReportStatus,
    remoteId,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Mark a report as failed with an error.
 */
export function markReportFailed(report: PolicyReport): PolicyReport {
  return {
    ...report,
    status: "failed" as ReportStatus,
    updatedAt: new Date().toISOString()
  };
}

/**
 * Build the Mastodon API payload for submitting a report.
 */
export function buildMastodonReportPayload(report: PolicyReport): {
  account_id: string;
  status_ids: string[];
  comment: string;
  category: string;
  rule_ids: string[];
  forward: boolean;
} {
  return {
    account_id: report.targetAccountId,
    status_ids: report.statusIds,
    comment: report.comment,
    category: report.category,
    rule_ids: report.ruleIds,
    forward: report.forward
  };
}
