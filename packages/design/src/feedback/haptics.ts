/**
 * Haptik ohne native Hülle.
 * iPhone: ios-haptics legt einen unsichtbaren Safari-Schalter (<input switch>)
 * über das Element; der echte Tap darauf löst den System-Tick aus.
 * Android & Co.: Vibration API mit Mustern aus EVENTS.
 * Alles hier ist Verstärkung. Fällt es weg, tragen Sound und Bewegung allein.
 */
import { hapticTrigger } from "ios-haptics";

const hasDom = typeof window !== "undefined" && typeof document !== "undefined";

export const isIOS: boolean =
  hasDom &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));

export const canVibrate: boolean = hasDom && !isIOS && typeof navigator.vibrate === "function";

let enabled = true;

export function setHapticsEnabled(on: boolean) {
  enabled = on;
  if (hasDom) document.documentElement.classList.toggle("sd-haptics-off", !on);
}

export function hapticsEnabled() {
  return enabled;
}

/**
 * Ref-Callback für jedes Element, das echt angetippt wird (Tasten, Tabs, Schalter).
 * React: <button ref={hapticTarget}>. Auf Nicht-iOS ein No-op.
 * Abschalten über setHapticsEnabled(false) blendet die Schalter per CSS aus
 * (.sd-haptics-off [data-haptic-trigger] in components.css).
 */
export function hapticTarget(el: HTMLElement | null | undefined): void {
  if (!el || !isIOS) return;
  hapticTrigger(el);
}

export function vibrate(pattern: number | number[]): boolean {
  if (!enabled || !canVibrate) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

/* ---------- Experimentell: Tick per Code (nur im Testlabor) ----------
 * Klickt ein verstecktes <label> für einen Schalter an. Ob iOS darauf einen
 * Tick gibt, hängt davon ab, ob der Aufruf noch als Nutzeraktion zählt
 * (WebKit Bug 285120). Wird im Demo-Labor auf echten iPhones gemessen. */

let hidden: { label: HTMLLabelElement; input: HTMLInputElement } | null = null;

function hiddenSwitch() {
  if (hidden) return hidden;
  const label = document.createElement("label");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  input.tabIndex = -1;
  label.setAttribute("aria-hidden", "true");
  Object.assign(label.style, { position: "fixed", left: "0", bottom: "0", width: "1px", height: "1px", opacity: "0.01", overflow: "hidden", pointerEvents: "none" });
  label.appendChild(input);
  document.body.appendChild(label);
  hidden = { label, input };
  return hidden;
}

/** Ein Tick per Code. Muss synchron in einem Tap-Handler laufen, sonst wirkungslos. */
export function iosTickProgrammatic(): void {
  if (!hasDom || !enabled) return;
  hiddenSwitch().label.click();
}

/** Mehrere Ticks hintereinander (Muster). Ob das ab dem zweiten Tick greift, ist offen. */
export function iosPatternProgrammatic(delaysMs: number[]): void {
  for (const d of delaysMs) {
    if (d === 0) iosTickProgrammatic();
    else setTimeout(iosTickProgrammatic, d);
  }
}
