import type { SlotResult } from "./monitoring/results";

function waitForRetry(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = globalThis.setTimeout(resolve, 700);
    signal?.addEventListener("abort", () => {
      globalThis.clearTimeout(timer);
      reject(new DOMException("Stopped", "AbortError"));
    }, { once: true });
  });
}

export class SlotRequestError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SlotRequestError";
  }
}

export async function fetchSlotResult(bookingUrl: string, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch("/api/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingUrl }),
        signal,
      });
      const result = (await response.json()) as SlotResult & { message?: string };
      const temporaryResult = response.ok
        && result.reasonCode === "request_failed"
        && (result.status === "unknown" || result.status === "failed");
      if (response.ok && !temporaryResult) return result;
      if (attempt === 0 && (temporaryResult || response.status === 429 || response.status >= 500)) {
        await waitForRetry(signal);
        continue;
      }
      if (response.ok) return result;
      throw new SlotRequestError(result.message ?? "The booking page could not be checked.", response.status);
    } catch (error) {
      if ((error as Error).name === "AbortError") throw error;
      if (error instanceof SlotRequestError) {
        if (attempt === 0 && (error.status === 429 || (error.status ?? 0) >= 500)) {
          await waitForRetry(signal);
          continue;
        }
        throw error;
      }
      if (attempt === 0) {
        await waitForRetry(signal);
        continue;
      }
      throw error;
    }
  }
  throw new Error("The booking page could not be checked.");
}

