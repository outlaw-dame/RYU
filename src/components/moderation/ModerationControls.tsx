/**
 * Phase 35 - Moderation Controls.
 *
 * Settings panel UI for managing mutes, blocks, domain blocks, and content filters.
 * Integrated into the app settings screen.
 */

import React, { useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useModeration } from "../../hooks/useModeration";
import type { SafeSearchLevel, ContentFilterAction } from "../../moderation/types";

type TabId = "mutes" | "blocks" | "domains" | "filters" | "safety";

/**
 * Moderation settings panel with tabs for different control types.
 */
export function ModerationControls() {
  const { t } = useTranslation();
  const moderation = useModeration();
  const [activeTab, setActiveTab] = useState<TabId>("mutes");

  return (
    <div className="moderation-controls" style={{ padding: "var(--space-3)" }}>
      <h2 style={{ fontSize: "var(--text-title3)", marginBottom: "var(--space-3)" }}>
        {t("moderation.title")}
      </h2>

      {/* Tab bar */}
      <div
        role="tablist"
        aria-label={t("moderation.tabsLabel")}
        style={{
          display: "flex",
          gap: "var(--space-1)",
          marginBottom: "var(--space-3)",
          overflowX: "auto"
        }}
      >
        {(["mutes", "blocks", "domains", "filters", "safety"] as TabId[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "var(--space-1) var(--space-2)",
              fontSize: "var(--text-caption1)",
              background: activeTab === tab ? "var(--color-accent)" : "var(--color-surface-secondary)",
              color: activeTab === tab ? "white" : "var(--color-text-primary)",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              whiteSpace: "nowrap"
            }}
          >
            {t(`moderation.tabs.${tab}`)}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div role="tabpanel">
        {activeTab === "mutes" && <MutesPanel />}
        {activeTab === "blocks" && <BlocksPanel />}
        {activeTab === "domains" && <DomainsPanel />}
        {activeTab === "filters" && <FiltersPanel />}
        {activeTab === "safety" && <SafetyPanel />}
      </div>
    </div>
  );
}

function MutesPanel() {
  const { t } = useTranslation();
  const { muteList, unmute } = useModeration();

  return (
    <div>
      <p style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
        {t("moderation.mutesDescription")}
      </p>
      {muteList.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("moderation.noMutes")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {muteList.map((entry) => (
            <li
              key={entry.accountId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)"
              }}
            >
              <span style={{ fontSize: "var(--text-body)" }}>
                {entry.acct ?? entry.accountId}
              </span>
              <button
                type="button"
                onClick={() => unmute(entry.accountId)}
                style={{
                  fontSize: "var(--text-caption1)",
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-1)",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)"
                }}
              >
                {t("moderation.unmute")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BlocksPanel() {
  const { t } = useTranslation();
  const { blockList, unblock } = useModeration();

  return (
    <div>
      <p style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
        {t("moderation.blocksDescription")}
      </p>
      {blockList.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("moderation.noBlocks")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {blockList.map((entry) => (
            <li
              key={entry.accountId}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)"
              }}
            >
              <span style={{ fontSize: "var(--text-body)" }}>
                {entry.acct ?? entry.accountId}
              </span>
              <button
                type="button"
                onClick={() => unblock(entry.accountId)}
                style={{
                  fontSize: "var(--text-caption1)",
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-1)",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)"
                }}
              >
                {t("moderation.unblock")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DomainsPanel() {
  const { t } = useTranslation();
  const { domainBlockList, blockDomain, unblockDomain } = useModeration();
  const [newDomain, setNewDomain] = useState("");

  const handleAdd = useCallback(() => {
    const trimmed = newDomain.trim();
    if (trimmed) {
      blockDomain(trimmed);
      setNewDomain("");
    }
  }, [newDomain, blockDomain]);

  return (
    <div>
      <p style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
        {t("moderation.domainsDescription")}
      </p>
      <div style={{ display: "flex", gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
        <input
          type="text"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          placeholder={t("moderation.domainPlaceholder")}
          aria-label={t("moderation.domainPlaceholder")}
          style={{
            flex: 1,
            padding: "var(--space-1) var(--space-2)",
            fontSize: "var(--text-body)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface-primary)"
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <button
          type="button"
          onClick={handleAdd}
          style={{
            padding: "var(--space-1) var(--space-2)",
            fontSize: "var(--text-caption1)",
            background: "var(--color-accent)",
            color: "white",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: "pointer"
          }}
        >
          {t("moderation.addDomain")}
        </button>
      </div>
      {domainBlockList.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("moderation.noDomainBlocks")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {domainBlockList.map((entry) => (
            <li
              key={entry.domain}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)"
              }}
            >
              <span style={{ fontSize: "var(--text-body)" }}>{entry.domain}</span>
              <button
                type="button"
                onClick={() => unblockDomain(entry.domain)}
                style={{
                  fontSize: "var(--text-caption1)",
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-1)",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)"
                }}
              >
                {t("moderation.removeDomain")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FiltersPanel() {
  const { t } = useTranslation();
  const { contentFilters, addFilter, removeFilter } = useModeration();
  const [newPhrase, setNewPhrase] = useState("");
  const [filterAction, setFilterAction] = useState<ContentFilterAction>("hide");
  const [wholeWord, setWholeWord] = useState(false);

  const handleAdd = useCallback(() => {
    const trimmed = newPhrase.trim();
    if (trimmed) {
      addFilter(trimmed, { action: filterAction, wholeWord });
      setNewPhrase("");
    }
  }, [newPhrase, filterAction, wholeWord, addFilter]);

  return (
    <div>
      <p style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
        {t("moderation.filtersDescription")}
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)", marginBottom: "var(--space-2)" }}>
        <input
          type="text"
          value={newPhrase}
          onChange={(e) => setNewPhrase(e.target.value)}
          placeholder={t("moderation.filterPhrasePlaceholder")}
          aria-label={t("moderation.filterPhrasePlaceholder")}
          style={{
            padding: "var(--space-1) var(--space-2)",
            fontSize: "var(--text-body)",
            border: "1px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            background: "var(--color-surface-primary)"
          }}
          onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        />
        <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
          <label style={{ fontSize: "var(--text-caption1)", display: "flex", alignItems: "center", gap: "var(--space-1)" }}>
            <input
              type="checkbox"
              checked={wholeWord}
              onChange={(e) => setWholeWord(e.target.checked)}
            />
            {t("moderation.wholeWord")}
          </label>
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value as ContentFilterAction)}
            aria-label={t("moderation.filterActionLabel")}
            style={{
              padding: "var(--space-1)",
              fontSize: "var(--text-caption1)",
              border: "1px solid var(--color-border)",
              borderRadius: "var(--radius-sm)",
              background: "var(--color-surface-primary)"
            }}
          >
            <option value="hide">{t("moderation.actionHide")}</option>
            <option value="warn">{t("moderation.actionWarn")}</option>
            <option value="blur">{t("moderation.actionBlur")}</option>
          </select>
          <button
            type="button"
            onClick={handleAdd}
            style={{
              padding: "var(--space-1) var(--space-2)",
              fontSize: "var(--text-caption1)",
              background: "var(--color-accent)",
              color: "white",
              border: "none",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer"
            }}
          >
            {t("moderation.addFilter")}
          </button>
        </div>
      </div>
      {contentFilters.length === 0 ? (
        <p style={{ color: "var(--color-text-tertiary)", fontSize: "var(--text-caption1)" }}>
          {t("moderation.noFilters")}
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {contentFilters.map((filter) => (
            <li
              key={filter.id}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "var(--space-2) 0",
                borderBottom: "1px solid var(--color-border)"
              }}
            >
              <div>
                <span style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>
                  {filter.phrase}
                </span>
                <span style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-tertiary)", marginLeft: "var(--space-1)" }}>
                  ({t(`moderation.action${filter.action.charAt(0).toUpperCase() + filter.action.slice(1)}`)})
                </span>
              </div>
              <button
                type="button"
                onClick={() => removeFilter(filter.id)}
                style={{
                  fontSize: "var(--text-caption1)",
                  background: "none",
                  border: "1px solid var(--color-border)",
                  borderRadius: "var(--radius-sm)",
                  padding: "var(--space-1)",
                  cursor: "pointer",
                  color: "var(--color-text-secondary)"
                }}
              >
                {t("moderation.removeFilter")}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function SafetyPanel() {
  const { t } = useTranslation();
  const { safeSearchLevel, setSafeSearchLevel } = useModeration();

  return (
    <div>
      <p style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)", marginBottom: "var(--space-2)" }}>
        {t("moderation.safetyDescription")}
      </p>
      <fieldset style={{ border: "none", padding: 0, margin: 0 }}>
        <legend style={{ fontSize: "var(--text-body)", fontWeight: 600, marginBottom: "var(--space-2)" }}>
          {t("moderation.safeSearchLabel")}
        </legend>
        {(["strict", "moderate", "off"] as SafeSearchLevel[]).map((level) => (
          <label
            key={level}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: "var(--space-2)",
              padding: "var(--space-2) 0",
              cursor: "pointer"
            }}
          >
            <input
              type="radio"
              name="safe-search"
              value={level}
              checked={safeSearchLevel === level}
              onChange={() => setSafeSearchLevel(level)}
              style={{ marginTop: "2px" }}
            />
            <div>
              <div style={{ fontSize: "var(--text-body)", fontWeight: 500 }}>
                {t(`moderation.safeSearch.${level}`)}
              </div>
              <div style={{ fontSize: "var(--text-caption1)", color: "var(--color-text-secondary)" }}>
                {t(`moderation.safeSearch.${level}Desc`)}
              </div>
            </div>
          </label>
        ))}
      </fieldset>
    </div>
  );
}
