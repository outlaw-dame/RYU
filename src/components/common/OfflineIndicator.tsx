import { AnimatePresence, motion } from "framer-motion";
import { useNetworkStatus } from "../../hooks/useNetworkStatus";

export function OfflineIndicator() {
  const { isOnline } = useNetworkStatus();
  return (
    <AnimatePresence>
      {!isOnline ? (
        <motion.div initial={{ y: -48, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: -48, opacity: 0 }} style={{
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 1000,
          padding: "calc(var(--space-2) + env(safe-area-inset-top, 0px)) var(--space-4) var(--space-2)",
          background: "var(--color-danger)",
          color: "white",
          textAlign: "center",
          fontSize: "var(--text-footnote)",
          fontWeight: 700
        }}>No internet connection</motion.div>
      ) : null}
    </AnimatePresence>
  );
}
