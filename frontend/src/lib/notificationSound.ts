// Genera los pitidos con Web Audio en vez de cargar un archivo de audio
// externo — así no dependemos de un asset ni de un servicio de terceros.
type SoundKind = "nuevo" | "retrasado" | "listo";

let sharedContext: AudioContext | null = null;

function getContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  if (sharedContext.state === "suspended") sharedContext.resume().catch(() => {});
  return sharedContext;
}

// Los navegadores bloquean audio hasta el primer gesto del usuario; se llama
// desde un listener de click/keydown para "desbloquear" el contexto lo antes
// posible, antes de que llegue la primera notificación real.
export function unlockAudio() {
  getContext();
}

function beep(ctx: AudioContext, freq: number, startAt: number, duration: number, gain = 0.15) {
  const osc = ctx.createOscillator();
  const gainNode = ctx.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  gainNode.gain.value = gain;
  osc.connect(gainNode);
  gainNode.connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + duration);
}

function playSound(kind: SoundKind) {
  const ctx = getContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    if (kind === "nuevo") {
      beep(ctx, 880, now, 0.12);
      beep(ctx, 1108, now + 0.14, 0.14);
    } else if (kind === "listo") {
      beep(ctx, 660, now, 0.1);
      beep(ctx, 990, now + 0.12, 0.12);
      beep(ctx, 1320, now + 0.24, 0.18);
    } else {
      beep(ctx, 440, now, 0.15, 0.2);
      beep(ctx, 440, now + 0.22, 0.15, 0.2);
      beep(ctx, 440, now + 0.44, 0.22, 0.2);
    }
  } catch {
    // Si el audio falla (bloqueado, sin soporte, etc.) la notificación
    // visual sigue funcionando igual — no interrumpimos el flujo por esto.
  }
}

export function playForTipo(tipo: string) {
  if (tipo === "PEDIDO_NUEVO" || tipo === "SOLICITUD_PEDIDO_CLIENTE") playSound("nuevo");
  else if (tipo === "ITEM_LISTO") playSound("listo");
  else playSound("retrasado");
}
