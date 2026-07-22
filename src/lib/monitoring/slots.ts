import chromium from "@sparticuz/chromium";
import { existsSync } from "node:fs";
import puppeteer, { type Browser, type Page } from "puppeteer-core";

import type { SlotResult } from "./results";
import { classifyCalendarSnapshot, type CalendarSnapshot } from "./slot-classifier";

const CALENDAR_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);

function isTrustedBookingUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && CALENDAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function checkBookingSlots(bookingUrl: string, signal?: AbortSignal): Promise<SlotResult> {
  if (!isTrustedBookingUrl(bookingUrl)) throw new Error("Only Google Calendar booking pages can be checked.");
  if (signal?.aborted) throw new DOMException("The check was stopped.", "AbortError");

  let browser: Browser | null = null;
  let page: Page | null = null;
  const abort = () => { void page?.close().catch(() => undefined); void browser?.close().catch(() => undefined); };
  signal?.addEventListener("abort", abort, { once: true });

  const readCalendar = async (): Promise<CalendarSnapshot> => page!.evaluate(() => {
    const buttons = [...document.querySelectorAll<HTMLElement>('button[data-grid-cell="true"]')];
    const cells = buttons.map((element) => ({
      date: element.getAttribute("data-date") ?? "",
      label: element.getAttribute("aria-label")?.trim() ?? "",
    })).filter((cell) => cell.date || cell.label);
    const cleanDay = (label: string) => label.replace(/,?\s*(?:no\s+)?available times?(?:\s+slots?)?.*$/i, "");
    const availableDates = cells
      .filter((cell) => /available times?/i.test(cell.label) && !/no available times?/i.test(cell.label))
      .map((cell) => cell.date || cleanDay(cell.label))
      .filter((date, index, all) => all.indexOf(date) === index);
    const isoDates = cells.map((cell) => cell.date).filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    const bodyText = document.body.innerText;
    const monthYear = bodyText.match(/(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i)?.[0];
    const firstLabel = cells.at(0)?.label;
    const lastLabel = cells.at(-1)?.label;
    return {
      availableDates,
      rangeStart: isoDates.at(0),
      rangeEnd: isoDates.at(-1),
      hasCalendarDays: cells.length > 0,
      hasJumpButton: [...document.querySelectorAll("button")].some((button) => /jump to the next bookable date/i.test(button.textContent ?? "")),
      saysNoAvailability: /no availability during these days/i.test(bodyText),
      cellFingerprint: cells.slice(0, 8).map((cell) => cell.label).join("|"),
      rangeLabel: firstLabel && lastLabel ? `${cleanDay(firstLabel)} through ${cleanDay(lastLabel)}${monthYear ? ` (${monthYear} view)` : ""}` : undefined,
    };
  });

  try {
    const localChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
    const useLocalChrome = !process.env.VERCEL && existsSync(localChrome);
    const executablePath = useLocalChrome ? localChrome : await chromium.executablePath();
    browser = await puppeteer.launch({
      args: useLocalChrome ? ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"] : [...chromium.args, "--disable-dev-shm-usage"],
      defaultViewport: { width: 1280, height: 720 }, executablePath, headless: true, protocolTimeout: 20_000, timeout: 15_000,
    });
    page = await browser.newPage();
    await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.waitForSelector('button[data-grid-cell="true"], button', { timeout: 15_000 });
    await new Promise((resolve) => setTimeout(resolve, 600));

    let snapshot = await readCalendar();
    let jumped = false;
    if (snapshot.availableDates.length === 0 && snapshot.hasJumpButton) {
      const previousFingerprint = snapshot.cellFingerprint;
      let clicked = false;
      const buttons = await page.$$("button");
      for (const button of buttons) {
        const text = await button.evaluate((element) => element.textContent ?? "");
        if (/jump to the next bookable date/i.test(text)) {
          await button.click();
          clicked = true;
          break;
        }
      }
      await Promise.all(buttons.map((button) => button.dispose()));
      if (clicked) {
        jumped = true;
        await page.waitForFunction((oldFingerprint) => {
          const dates = [...document.querySelectorAll<HTMLElement>('button[data-grid-cell="true"]')];
          const hasAvailable = dates.some((cell) => /available times?/i.test(cell.getAttribute("aria-label") ?? "") && !/no available times?/i.test(cell.getAttribute("aria-label") ?? ""));
          const fingerprint = dates.slice(0, 8).map((cell) => cell.getAttribute("aria-label") ?? "").join("|");
          return hasAvailable || (fingerprint && fingerprint !== oldFingerprint);
        }, { timeout: 12_000 }, previousFingerprint).catch(() => undefined);
        await new Promise((resolve) => setTimeout(resolve, 600));
        snapshot = await readCalendar();
      }
    }

    const result = classifyCalendarSnapshot(snapshot, jumped);
    if (result.status === "unknown") console.warn("[slot-check] Calendar loaded without a confirmable result", { jumped, checkedRange: result.checkedRange?.description });
    return result;
  } catch (error) {
    if (signal?.aborted || (error instanceof Error && error.name === "AbortError")) throw error;
    const errorMessage = error instanceof Error ? error.message : String(error);
    const diagnostic = page && !page.isClosed() ? await page.evaluate(() => ({ url: location.href, title: document.title, text: document.body?.innerText.slice(0, 180) })).catch(() => null) : null;
    console.error("[slot-check] Google Calendar check failed", errorMessage, diagnostic);
    const reasonCode = /failed to launch|executable|browser was not found|could not find chrome/i.test(errorMessage) ? "browser_launch_failed" : /navigation|waiting for selector|timeout/i.test(errorMessage) ? "navigation_timeout" : "request_failed";
    return { status: "failed", availableDates: [], checkedAt: new Date().toISOString(), checkedRange: { description: "The calendar could not be read" }, message: "The booking page could not be checked right now. Open it directly or try again.", reasonCode };
  } finally {
    signal?.removeEventListener("abort", abort);
    await page?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
}
