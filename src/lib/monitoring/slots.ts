import chromium from "@sparticuz/chromium";
import { existsSync } from "node:fs";
import puppeteer from "puppeteer-core";

const CALENDAR_HOSTS = new Set(["calendar.app.google", "calendar.google.com"]);

type SlotCheck = {
  status: "available" | "none_in_view" | "unknown" | "failed";
  availableDates: string[];
  checkedAt: string;
  checkedRange: { description: string };
  message: string;
};

function isTrustedBookingUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && CALENDAR_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}

export async function checkBookingSlots(bookingUrl: string): Promise<SlotCheck> {
  if (!isTrustedBookingUrl(bookingUrl)) throw new Error("Only Google Calendar booking pages can be checked.");

  const localChrome = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const executablePath = process.env.VERCEL || !existsSync(localChrome) ? await chromium.executablePath() : localChrome;
  const browser = await puppeteer.launch({
    args: chromium.args,
    defaultViewport: { width: 1280, height: 720 },
    executablePath,
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.goto(bookingUrl, { waitUntil: "domcontentloaded", timeout: 25_000 });
    await page.waitForSelector("[aria-label]", { timeout: 12_000 });
    await new Promise((resolve) => setTimeout(resolve, 1_500));

    const dates = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("[aria-label]")]
      .map((element) => element.getAttribute("aria-label")?.trim() ?? "")
      .filter((label) => /available times/i.test(label) && !/no available times/i.test(label))
      .filter((label, index, all) => all.indexOf(label) === index)
      .slice(0, 5));

    const checkedAt = new Date().toISOString();
    const checkedRange = { description: "Google's currently rendered appointment range" };
    if (dates.length > 0) return { status: "available", availableDates: dates, checkedAt, checkedRange, message: "Google Calendar shows an available date. Open the booking page to choose its exact time." };
    return { status: "none_in_view", availableDates: [], checkedAt, checkedRange, message: "No date found in the checked range. Open the booking page to check later dates." };
  } catch {
    return { status: "failed", availableDates: [], checkedAt: new Date().toISOString(), checkedRange: { description: "Google's currently rendered appointment range" }, message: "The booking page could not be checked right now. You can still open it directly." };
  } finally {
    await browser.close();
  }
}
