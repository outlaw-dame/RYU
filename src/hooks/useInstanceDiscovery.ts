import { useCallback, useEffect, useState } from "react";
import {
  type DiscoverFediverseInstancesOptions,
  type FediverseInstance
} from "../sync/instance-discovery";

const DEFAULT_INSTANCE_DISCOVERY_ENDPOINT = "/api/discovery/instances";

type DiscoveryState = {
  loading: boolean;
  error: string | null;
  instances: FediverseInstance[];
  refreshedAt: string | null;
};

const initialState: DiscoveryState = {
  loading: false,
  error: null,
  instances: [],
  refreshedAt: null
};

function buildInstanceDiscoveryUrl(options: DiscoverFediverseInstancesOptions, force: boolean): string {
  const endpoint = import.meta.env.VITE_INSTANCE_DISCOVERY_ENDPOINT ?? DEFAULT_INSTANCE_DISCOVERY_ENDPOINT;
  const url = new URL(endpoint, window.location.origin);

  url.searchParams.set("signupOnly", String(options.signupOnly ?? true));
  url.searchParams.set("mastodonApiCompatibleOnly", String(options.mastodonApiCompatibleOnly ?? true));
  url.searchParams.set("force", String(force));

  if (options.preferredCountry) {
    url.searchParams.set("preferredCountry", options.preferredCountry);
  }

  if (options.searchQuery) {
    url.searchParams.set("searchQuery", options.searchQuery);
  }

  if (options.limit && options.limit > 0) {
    url.searchParams.set("limit", String(Math.floor(options.limit)));
  }

  for (const slug of options.preferredSoftwareSlugs ?? []) {
    url.searchParams.append("preferredSoftwareSlugs", slug);
  }

  return url.toString();
}

function parseInstanceDiscoveryPayload(payload: unknown): FediverseInstance[] {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { instances?: unknown }).instances)) {
    return [];
  }

  return (payload as { instances: FediverseInstance[] }).instances;
}

function friendlyDiscoveryError(error: unknown): string {
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return "Server directory is temporarily unavailable. You can still enter your server manually.";
}

async function fetchDiscoveredInstances(options: DiscoverFediverseInstancesOptions, force: boolean): Promise<FediverseInstance[]> {
  const response = await fetch(buildInstanceDiscoveryUrl(options, force), {
    headers: { Accept: "application/json" }
  });

  const payload = await response.json().catch(() => null) as { message?: string } | null;

  if (!response.ok) {
    throw new Error(payload?.message ?? "Server directory is temporarily unavailable. You can still enter your server manually.");
  }

  return parseInstanceDiscoveryPayload(payload);
}

export function useInstanceDiscovery(options: DiscoverFediverseInstancesOptions) {
  const [state, setState] = useState<DiscoveryState>(initialState);

  const {
    signupOnly = true,
    mastodonApiCompatibleOnly = true,
    preferredCountry,
    searchQuery,
    limit
  } = options;
  const preferredSoftwareSlugs = options.preferredSoftwareSlugs ?? [];
  const preferredSoftwareKey = preferredSoftwareSlugs.join("|");

  const refresh = useCallback(async (force = false) => {
    setState((current) => ({ ...current, loading: true, error: null }));

    const discoveryOptions = {
      signupOnly,
      mastodonApiCompatibleOnly,
      preferredCountry,
      preferredSoftwareSlugs,
      searchQuery,
      limit
    };

    try {
      const instances = await fetchDiscoveredInstances(discoveryOptions, force);
      setState({
        loading: false,
        error: null,
        instances,
        refreshedAt: new Date().toISOString()
      });
    } catch (error) {
      setState({
        instances: [],
        refreshedAt: null,
        loading: false,
        error: friendlyDiscoveryError(error)
      });
    }
  }, [
    signupOnly,
    mastodonApiCompatibleOnly,
    preferredCountry,
    preferredSoftwareKey,
    searchQuery,
    limit
  ]);

  useEffect(() => {
    void refresh(false);
  }, [refresh]);

  return {
    loading: state.loading,
    error: state.error,
    instances: state.instances,
    refreshedAt: state.refreshedAt,
    refresh
  };
}
