import { describe, expect, it } from "vitest";
import {
  createReport,
  validateReport,
  markReportSubmitted,
  markReportFailed,
  buildMastodonReportPayload
} from "./report-flow";

describe("report-flow", () => {
  describe("createReport", () => {
    it("creates a draft report with required fields", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "Spam content",
        category: "spam"
      });

      expect(report.targetAccountId).toBe("acc-123");
      expect(report.comment).toBe("Spam content");
      expect(report.category).toBe("spam");
      expect(report.status).toBe("draft");
      expect(report.statusIds).toEqual([]);
      expect(report.ruleIds).toEqual([]);
      expect(report.forward).toBe(false);
    });

    it("creates a report with all optional fields", () => {
      const report = createReport({
        targetAccountId: "acc-456",
        statusIds: ["status-1", "status-2"],
        comment: "Violation of rules",
        category: "violation",
        ruleIds: ["rule-1", "rule-2"],
        forward: true,
        instanceOrigin: "https://mastodon.social",
        accountId: "reporter-1"
      });

      expect(report.statusIds).toEqual(["status-1", "status-2"]);
      expect(report.ruleIds).toEqual(["rule-1", "rule-2"]);
      expect(report.forward).toBe(true);
      expect(report.instanceOrigin).toBe("https://mastodon.social");
      expect(report.accountId).toBe("reporter-1");
    });

    it("trims comment whitespace", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "  Trimmed comment  ",
        category: "other"
      });
      expect(report.comment).toBe("Trimmed comment");
    });
  });

  describe("validateReport", () => {
    it("returns no errors for valid report", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "Valid report",
        category: "spam"
      });
      expect(validateReport(report)).toEqual([]);
    });

    it("validates target account ID", () => {
      const report = createReport({
        targetAccountId: "",
        comment: "Report",
        category: "spam"
      });
      // Force empty target
      report.targetAccountId = "   ";
      const errors = validateReport(report);
      expect(errors).toContain("Target account ID is required");
    });

    it("validates comment is required", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "x",
        category: "spam"
      });
      report.comment = "   ";
      const errors = validateReport(report);
      expect(errors).toContain("Comment is required");
    });

    it("validates comment length", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "x".repeat(1001),
        category: "spam"
      });
      const errors = validateReport(report);
      expect(errors).toContain("Comment must be 1000 characters or fewer");
    });

    it("validates max status IDs", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        statusIds: Array.from({ length: 21 }, (_, i) => `status-${i}`),
        comment: "Report",
        category: "spam"
      });
      const errors = validateReport(report);
      expect(errors).toContain("Maximum 20 status IDs per report");
    });
  });

  describe("markReportSubmitted", () => {
    it("updates status and remote ID", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "Report",
        category: "spam"
      });
      const submitted = markReportSubmitted(report, "remote-42");
      expect(submitted.status).toBe("submitted");
      expect(submitted.remoteId).toBe("remote-42");
    });
  });

  describe("markReportFailed", () => {
    it("updates status to failed", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        comment: "Report",
        category: "spam"
      });
      const failed = markReportFailed(report);
      expect(failed.status).toBe("failed");
    });
  });

  describe("buildMastodonReportPayload", () => {
    it("builds the correct API payload", () => {
      const report = createReport({
        targetAccountId: "acc-123",
        statusIds: ["s1", "s2"],
        comment: "Spam account",
        category: "spam",
        ruleIds: ["r1"],
        forward: true
      });

      const payload = buildMastodonReportPayload(report);
      expect(payload).toEqual({
        account_id: "acc-123",
        status_ids: ["s1", "s2"],
        comment: "Spam account",
        category: "spam",
        rule_ids: ["r1"],
        forward: true
      });
    });
  });
});
