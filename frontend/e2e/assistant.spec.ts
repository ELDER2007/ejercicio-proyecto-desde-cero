import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const card = {
  id: "11111111-1111-1111-1111-111111111111",
  slug: "ceramica-para-principiantes",
  name: "Cerámica para principiantes",
  category: "Cerámica",
  starts_at: "2026-12-05T14:00:00Z",
  price_minor: 18_000_000,
  currency: "COP",
  seats_available: 4,
  url: "http://localhost:3000/es/cursos/ceramica-para-principiantes",
};

test("el asistente no aparece si el backend lo tiene desactivado", async ({ page }) => {
  await page.route("**/api/v1/assistant/status", (r) => r.fulfill({ json: { enabled: false } }));
  await page.goto("/es");
  await expect(page.getByRole("button", { name: /Pregúntale al asistente/ })).toHaveCount(0);
});

test("asistente: pregunta, respuesta y tarjetas de cursos reales", async ({ page }) => {
  let sent: { locale: string; messages: { role: string; content: string }[] } | null = null;
  await page.route("**/api/v1/assistant/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.route("**/api/v1/assistant/chat", async (r) => {
    sent = r.request().postDataJSON();
    await r.fulfill({ json: { reply: "Te recomiendo Cerámica para principiantes.", courses: [card] } });
  });

  await page.goto("/es");
  await page.getByRole("button", { name: /Pregúntale al asistente/ }).click();
  const dialog = page.getByRole("dialog", { name: "Asistente de Tallerya" });
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel("Escribe tu pregunta…")).toBeFocused(); // foco al abrir

  // Accesibilidad con el diálogo abierto
  const serious = (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations.filter((v) =>
    ["serious", "critical"].includes(v.impact ?? ""),
  );
  expect(serious.map((v) => v.id)).toEqual([]);

  await page.getByLabel("Escribe tu pregunta…").fill("Quiero algo creativo este fin de semana");
  await dialog.getByRole("button", { name: "Enviar" }).click();

  await expect(dialog.getByText("Te recomiendo Cerámica para principiantes.")).toBeVisible();
  const link = dialog.getByRole("link", { name: "Cerámica para principiantes" });
  await expect(link).toHaveAttribute("href", /\/es\/cursos\/ceramica-para-principiantes/);
  await expect(dialog.getByText(/180\.000/)).toBeVisible(); // precio de los DATOS, no del texto del modelo
  await expect(dialog.getByText(/quedan 4 plazas/)).toBeVisible();
  expect(sent).toMatchObject({ locale: "es", messages: [{ role: "user", content: "Quiero algo creativo este fin de semana" }] });

  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Pregúntale al asistente/ })).toBeFocused(); // devuelve el foco
});

test("asistente: un error de la API se muestra en claro, sin detalles técnicos", async ({ page }) => {
  await page.route("**/api/v1/assistant/status", (r) => r.fulfill({ json: { enabled: true } }));
  await page.route("**/api/v1/assistant/chat", (r) =>
    r.fulfill({ status: 502, json: { error: { code: "ASSISTANT_UNAVAILABLE", message: "x", details: null, request_id: "r" } } }),
  );
  await page.goto("/es");
  await page.getByRole("button", { name: /Pregúntale al asistente/ }).click();
  await page.getByLabel("Escribe tu pregunta…").fill("hola");
  await page.getByRole("button", { name: "Enviar" }).click();
  const dialog = page.getByRole("dialog", { name: "Asistente de Tallerya" });
  await expect(dialog.getByRole("alert")).toContainText("no está disponible");
  await expect(dialog).not.toContainText("ASSISTANT_UNAVAILABLE"); // sin códigos técnicos
});
