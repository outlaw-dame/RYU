export const iosSpring = {
  type: "spring" as const,
  damping: 30,
  stiffness: 300,
  mass: 0.8
};

export const pagePush = {
  initial: { x: "100%", opacity: 0.92 },
  animate: { x: 0, opacity: 1, transition: iosSpring },
  exit: { x: "100%", opacity: 0.92, transition: { ...iosSpring, damping: 35 } }
};

export const cardReveal = {
  initial: { opacity: 0, y: 8, scale: 0.96 },
  animate: { opacity: 1, y: 0, scale: 1 },
  transition: { duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }
};
