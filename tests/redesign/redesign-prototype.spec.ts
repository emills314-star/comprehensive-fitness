import { expect, test } from "@playwright/test";

test("all concepts and all screen families remain inspectable", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByRole("button", { name: "concepts", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Change the organizing idea/ })).toBeVisible();
  const directionList = page.getByRole("group", { name: "Design directions" });
  await expect(directionList.getByRole("button")).toHaveCount(15);
  await directionList.getByRole("button", { name: /Body Atlas/ }).click();
  await page.getByRole("tab", { name: "Data & privacy" }).click();
  await expect(page.getByLabel(/Body Atlas: Data & privacy/)).toBeVisible();
  await expect(page.locator("body")).not.toHaveCSS("overflow-x", "scroll");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
  const seriousAxeViolations = await page.evaluate(async () => {
    const axe = (window as typeof window & { axe: { run: (root: Document) => Promise<{ violations: Array<{ id: string; impact: string | null }> }> } }).axe;
    const result = await axe.run(document);
    return result.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical");
  });
  expect(seriousAxeViolations).toEqual([]);
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("winner supports logging, rest, submission, planning, progress, and consent", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "winner", exact: true }).click();
  await page.getByRole("button", { name: "Complete set" }).click();
  await expect(page.getByRole("timer")).toContainText("2:30");
  await page.getByRole("button", { name: "Skip rest" }).click();
  await page.getByRole("button", { name: "Review submission" }).click();
  await expect(page.getByRole("dialog", { name: "Submit this workout?" })).toBeVisible();
  await page.getByRole("button", { name: "Keep editing" }).click();
  await page.getByRole("button", { name: "plan", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Six-week progression block" })).toBeVisible();
  await page.getByRole("button", { name: "progress", exact: true }).click();
  await expect(page.getByRole("img", { name: /Estimated one-repetition maximum/ })).toBeVisible();
  await page.getByRole("button", { name: "data", exact: true }).click();
  const consent = page.getByRole("checkbox");
  await consent.check();
  await expect(consent).toBeChecked();
});

test("keyboard and reduced-motion preferences preserve the primary journey", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to redesign content" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#redesign-main")).toBeFocused();
  const motion = await page.evaluate(() => getComputedStyle(document.querySelector(".score-bar i")!).transitionDuration);
  expect(motion).toBe("0s");
});
