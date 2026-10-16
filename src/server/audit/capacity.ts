import { LIMITS } from "../../core/limits";
let active = 0;
export function acquireAuditSlot(): (() => void) | null {
  if (active >= LIMITS.audits) return null;
  active++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      active--;
    }
  };
}
