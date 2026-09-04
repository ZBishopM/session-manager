import { test, expect, type Page } from "@playwright/test";

/**
 * Real-browser signup/login. This is regression coverage for a reported
 * bug: signing up showed the browser's own native pattern-mismatch
 * tooltip ("usa el formato solicitado") instead of anything the app
 * controls. Root cause was `autocomplete="current-password"` on the
 * passcode field even during signup, which invites a password manager to
 * autofill an unrelated saved password that then fails the 4-digit
 * pattern check. Fixed in AuthForm.svelte: `new-password` autocomplete in
 * signup mode, `novalidate` on the form so ALL validation feedback is the
 * app's own controlled message, and input sanitization so the value
 * can't drift from a clean 4-digit string regardless of how it got typed
 * in. Component tests (AuthForm.test.ts) cover the sanitization/attribute
 * logic in isolation; this file is what actually exercises a real
 * browser's autofill/validation behavior against a real backend, which no
 * other test layer in this repo can do.
 */

function uniqueNickname(label: string): string {
  return `e2e_${label}_${Date.now()}`;
}

// SvelteKit SSR-renders the initial HTML, then hydrates client-side; a
// click that lands before hydration attaches event listeners is a no-op
// even though Playwright's own actionability checks (visible/enabled/
// stable) all pass — the DOM element exists, it's just not listening
// yet. This bit the very first version of this file: mode-signup clicks
// silently did nothing, every field stayed on login-mode defaults, and
// the resulting "stuck on /auth" failures looked exactly like a real app
// bug until traced back to this. Centralizing the wait here rather than
// repeating it before every interaction.
async function gotoAuth(page: Page): Promise<void> {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
}

test.describe("signup", () => {
  test("creates an account end-to-end and lands on /profile", async ({ page }) => {
    const nickname = uniqueNickname("signup");
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("1234");
    await page.getByTestId("submit").click();

    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole("heading", { name: nickname })).toBeVisible();
  });

  test("passcode field is new-password in signup mode (not current-password)", async ({ page }) => {
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await expect(page.getByTestId("passcode")).toHaveAttribute("autocomplete", "new-password");
  });

  test("does not rely on the browser's native validation — form is novalidate, invalid input shows the app's own hint", async ({ page }) => {
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await expect(page.locator("form")).toHaveAttribute("novalidate", "");

    await page.getByTestId("nickname").fill(uniqueNickname("novalidate"));
    await page.getByTestId("passcode").fill("12");
    await page.getByTestId("passcode").blur();
    await expect(page.getByTestId("passcode-hint")).toBeVisible();

    // Native constraint validation would block form submission outright;
    // confirm the submit button is just disabled instead (app-controlled),
    // and clicking it (were it not disabled) wouldn't trigger a browser
    // popup that could hang the rest of the test.
    await expect(page.getByTestId("submit")).toBeDisabled();
  });

  test("rejects a duplicate nickname with an in-app error, not a crash", async ({ page }) => {
    const nickname = uniqueNickname("dup");
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("1234");
    await page.getByTestId("submit").click();
    await expect(page).toHaveURL(/\/profile/);

    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("5678");
    await page.getByTestId("submit").click();

    await expect(page.getByTestId("auth-error")).toBeVisible();
    await expect(page).toHaveURL(/\/auth/);
  });
});

test.describe("login", () => {
  test("an existing account can log back in after logging out", async ({ page }) => {
    const nickname = uniqueNickname("login");
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("4321");
    await page.getByTestId("submit").click();
    await expect(page).toHaveURL(/\/profile/);

    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await expect(page).toHaveURL("http://localhost:5173/");

    await gotoAuth(page);
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("4321");
    await page.getByTestId("submit").click();

    await expect(page).toHaveURL(/\/profile/);
    await expect(page.getByRole("heading", { name: nickname })).toBeVisible();
  });

  test("passcode field is current-password in login mode", async ({ page }) => {
    await gotoAuth(page);
    await expect(page.getByTestId("passcode")).toHaveAttribute("autocomplete", "current-password");
  });

  test("wrong passcode shows an in-app error, not a silent failure", async ({ page }) => {
    const nickname = uniqueNickname("wrongpass");
    await gotoAuth(page);
    await page.getByTestId("mode-signup").click();
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("1111");
    await page.getByTestId("submit").click();
    await expect(page).toHaveURL(/\/profile/);

    await page.getByRole("button", { name: /cerrar sesión/i }).click();
    await gotoAuth(page);
    await page.getByTestId("nickname").fill(nickname);
    await page.getByTestId("passcode").fill("2222");
    await page.getByTestId("submit").click();

    await expect(page.getByTestId("auth-error")).toBeVisible();
  });
});
