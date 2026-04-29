import { useCallback, useEffect, useState } from "react";
import {
  discoverFediverseInstances,
  type DiscoverFediverseInstancesOptions,
  type FediverseInstance
} from "../sync/instance-discovery";

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

    try {
      const instances = await discoverFediverseInstances({
        signupOnly,
        mastodonApiCompatibleOnly,
        preferredCountry,
        preferredSoftwareSlugs,
        searchQuery,
        limit,
        force
      });
      setState({
        loading: false,
        error: null,
        instances,
        refreshedAt: new Date().toISOString()
      });
    } catch (error) {
      setState((current) => ({
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : String(error)
      }));
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
