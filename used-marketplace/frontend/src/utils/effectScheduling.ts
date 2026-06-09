export function scheduleEffectWork(work: () => void) {
  const timeoutId = window.setTimeout(work, 0);

  return () => window.clearTimeout(timeoutId);
}
