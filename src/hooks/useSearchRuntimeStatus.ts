import { useSyncExternalStore } from 'react';
import { getSearchRuntimeStatus, subscribeSearchRuntimeStatus } from '../search/runtime-status';

export function useSearchRuntimeStatus() {
  return useSyncExternalStore(
    subscribeSearchRuntimeStatus,
    getSearchRuntimeStatus,
    getSearchRuntimeStatus
  );
}
