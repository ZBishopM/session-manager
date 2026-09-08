import { test, expect, type Page } from "@playwright/test";

/**
 * La sesión es la reunión, no la partida. Dura hasta que el anfitrión la
 * corta, y dentro caben varias partidas de varios juegos. Este fichero cubre
 * justo lo que no cubre ninguna otra capa: que el anfitrión entra en su
 * propia sesión, que el reloj corre, que una partida terminada NO cierra la
 * sesión, y que cada partida tiene su propia lista de quién juega.
 */

const PB = "http://127.0.0.1:8090";

function nick(label: string): string {
  return `e2e_${label}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

/** SvelteKit hidrata tras la navegación; un click anterior a eso no dispara
 *  nada. Mismo motivo que el helper equivalente de auth.spec.ts. */
async function gotoHydrated(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

async function signUp(page: Page, nickname: string): Promise<void> {
  await page.goto("/auth");
  await page.waitForLoadState("networkidle");
  await page.getByTestId("mode-signup").click();
  await page.getByTestId("nickname").fill(nickname);
  await page.getByTestId("passcode").fill("1234");
  await page.getByTestId("submit").click();
  await expect(page).toHaveURL(/\/profile/);
}

/** Un juego en el catálogo: sin él no hay nada que votar. Se reutiliza el
 *  token que ya tiene el navegador en vez de autenticar otra vez, así el test
 *  no depende de cómo se llame el campo de identidad. */
async function seedGame(page: Page): Promise<void> {
  const auth = await page.evaluate(() => localStorage.getItem("pocketbase_auth"));
  const { token, record } = JSON.parse(auth ?? "{}") as { token: string; record: { id: string } };
  const res = await page.request.post(`${PB}/api/collections/games/records`, {
    headers: { Authorization: token },
    data: { name: `Juego ${Date.now()}`, min_players: 1, max_players: 8, created_by: record.id },
  });
  expect(res.ok(), `no se pudo sembrar el juego: ${await res.text()}`).toBe(true);
}

test("el anfitrión queda dentro de su sesión, con reloj y QR para compartir", async ({ page }) => {
  await signUp(page, nick("host"));

  await gotoHydrated(page, "/host");
  await page.getByTestId("create-session").click();
  await page.getByTestId("goto-session").click();
  await expect(page).toHaveURL(/\/session\//);

  // Dentro desde el minuto cero: antes el anfitrión veía el botón "Entrar"
  // en su propia sesión y el contador marcaba 0.
  await expect(page.getByTestId("joined")).toBeVisible();
  await expect(page.getByTestId("participant-count")).toContainText("1");
  await expect(page.getByTestId("join")).toHaveCount(0);

  // El reloj corre.
  const first = await page.getByTestId("session-elapsed").textContent();
  await page.waitForTimeout(2100);
  expect(await page.getByTestId("session-elapsed").textContent()).not.toBe(first);

  // El QR se puede volver a enseñar sin pasar por /host.
  await page.getByTestId("toggle-qr").click();
  await expect(page.getByTestId("session-qr")).toBeVisible();

  // Y desde el inicio se ve en qué sesión estás.
  await gotoHydrated(page, "/");
  await expect(page.getByTestId("active-session")).toBeVisible();
  await expect(page.getByTestId("active-session")).toContainText("⏱");
});

test("una partida terminada no cierra la sesión; el anfitrión la cierra", async ({ page }) => {
  const host = nick("life");
  await signUp(page, host);
  await seedGame(page);

  await gotoHydrated(page, "/host");
  await page.getByTestId("create-session").click();
  await page.getByTestId("goto-session").click();
  await expect(page).toHaveURL(/\/session\//);

  await page.getByTestId("start-session").click();

  // Votar deja el juego elegido y pasa a la lista de quién juega.
  await page.getByTestId(/^vote-/).first().click();
  await expect(page.getByTestId("toggle-roster")).toBeVisible({ timeout: 10_000 });

  // Apuntarse es opt-in por partida: sin nadie apuntado no se puede empezar.
  await expect(page.getByTestId("start-match")).toBeDisabled();
  await page.getByTestId("toggle-roster").click();
  await expect(page.getByTestId("start-match")).toBeEnabled();

  await page.getByTestId("start-match").click();
  await expect(page.getByTestId("confirm")).toBeVisible({ timeout: 10_000 });
  // Sin ganador marcado el botón está deshabilitado a propósito.
  await page.getByTestId(/^winner-(?!status-)/).first().click();
  await page.getByTestId("confirm").click();

  // Lo que motivó todo esto: la sesión sigue viva y se puede jugar otra.
  await expect(page.getByTestId("new-match")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId("status")).not.toContainText("terminada");

  await page.getByTestId("end-session").click();
  await expect(page.getByTestId("status")).toContainText("terminada", { timeout: 10_000 });
});
