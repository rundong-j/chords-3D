/** Phase 1: DeviceOrientation listener + EMA smoothing (no Tonnetz mapping yet). */

export const DEFAULT_ORIENTATION_SMOOTHING = 0.18;

/** True when the DeviceOrientation API exists (still requires HTTPS + permission on iOS Safari). */
export function isDeviceOrientationAvailable() {
  return typeof DeviceOrientationEvent !== "undefined";
}

/** iOS 13+ Safari exposes permission behind a user gesture. */
export function requiresOrientationPermissionPrompt() {
  return (
    typeof DeviceOrientationEvent === "function" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  );
}

export async function requestOrientationPermission() {
  if (!requiresOrientationPermissionPrompt()) return true;
  const result = await DeviceOrientationEvent.requestPermission();
  return result === "granted";
}

function emaAngle(prev, raw, smoothing) {
  if (raw == null || Number.isNaN(Number(raw))) return prev;
  const x = Number(raw);
  if (prev == null || Number.isNaN(Number(prev))) return x;
  return prev + smoothing * (x - prev);
}

/**
 * @param {{
 *   smoothing?: number,
 *   onUpdate: (data: {
 *     alpha: number | null,
 *     beta: number | null,
 *     gamma: number | null,
 *     raw: { alpha: number | null, beta: number | null, gamma: number | null },
 *   }) => void,
 * }} opts
 */
export function createDeviceOrientationSession(opts) {
  const smoothing =
    opts.smoothing != null ? opts.smoothing : DEFAULT_ORIENTATION_SMOOTHING;
  const onUpdate = opts.onUpdate;

  let alpha = null;
  let beta = null;
  let gamma = null;

  function handle(ev) {
    const ra = ev.alpha != null ? Number(ev.alpha) : null;
    const rb = ev.beta != null ? Number(ev.beta) : null;
    const rg = ev.gamma != null ? Number(ev.gamma) : null;

    alpha = emaAngle(alpha, ra, smoothing);
    beta = emaAngle(beta, rb, smoothing);
    gamma = emaAngle(gamma, rg, smoothing);

    onUpdate({
      alpha,
      beta,
      gamma,
      raw: { alpha: ra, beta: rb, gamma: rg },
    });
  }

  return {
    start() {
      window.addEventListener("deviceorientation", handle, { passive: true });
    },
    stop() {
      window.removeEventListener("deviceorientation", handle);
      alpha = null;
      beta = null;
      gamma = null;
    },
  };
}
