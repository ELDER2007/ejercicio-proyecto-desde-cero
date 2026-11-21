import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const SLUG_ES = "pan-de-masa-madre";
const SLUG_EN = "sourdough-bread";
const ADMIN = { email: process.env.E2E_ADMIN_EMAIL ?? "", password: process.env.E2E_ADMIN_PASSWORD ?? "" };
const stamp = Date.now();
const client = { email: `e2e-${stamp}@example.com`, password: `Clave-${stamp}-segura`, name: "Eva E2E", phone: "+573001112233" };

async function login(page: Page, email: string, password: string) {
  await page.goto("/es/iniciar-sesion");
  await page.getByLabel("Correo electrónico").fill(email);
  await page.getByLabel("Contraseña").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/es\/mi-cuenta/); // el login terminó (cookies ya establecidas)
}

test.describe.configure({ mode: "serial" });

test("visitante: catálogo, búsqueda, idioma y detalle con SEO", async ({ page }) => {
  await page.goto("/es/cursos");
  await expect(page.getByRole("heading", { level: 1, name: "Cursos y talleres" })).toBeVisible();
  await page.getByLabel("Buscar").fill("masa madre");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await expect(page).toHaveURL(/q=masa/);
  await page.getByRole("link", { name: "Pan de masa madre" }).first().click();
  await expect(page).toHaveURL(new RegExp(`/es/cursos/${SLUG_ES}`));
  await expect(page.getByRole("button", { name: "Reservar mi plaza" })).toHaveCount(0); // visitante: debe iniciar sesión
  await expect(page.getByRole("link", { name: "Inicia sesión para reservar" })).toBeVisible();
  // El selector de idioma lleva al SLUG correcto del otro idioma (no al mismo slug).
  await page.getByRole("link", { name: "en", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/en/courses/${SLUG_EN}`));
  await expect(page.getByRole("heading", { level: 1, name: "Sourdough Bread" })).toBeVisible();
  const ld = await page.locator('script[type="application/ld+json"]').first().textContent();
  expect(JSON.parse(ld ?? "{}")["@type"]).toBe("Event");
});

test("accesibilidad: sin violaciones graves en páginas públicas", async ({ page }) => {
  for (const path of ["/es", "/es/cursos", `/es/cursos/${SLUG_ES}`, "/es/iniciar-sesion", "/es/registro", "/en/faq"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
    const serious = results.violations.filter((v) => ["serious", "critical"].includes(v.impact ?? ""));
    expect(serious.map((v) => `${path}: ${v.id} (${v.nodes.length})`)).toEqual([]);
  }
});

test("registro valida y NO preselecciona marketing", async ({ page }) => {
  await page.goto("/es/registro");
  await expect(page.getByLabel(/promociones, descuentos y ofertas/)).not.toBeChecked();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await expect(page.getByRole("alert").first()).toBeVisible();
});

test("cliente: reservar, pagar (simulado) y ver el estado", async ({ page }) => {
  await page.goto(`/es/cursos/${SLUG_ES}`);
  await page.getByRole("link", { name: "Inicia sesión para reservar" }).click();
  await page.getByRole("link", { name: "Crear cuenta" }).last().click();
  await page.getByLabel("Nombre completo").fill(client.name);
  await page.getByLabel("Correo electrónico").fill(client.email);
  await page.getByLabel("Teléfono").fill(client.phone);
  await page.getByLabel("Contraseña").fill(client.password);
  await page.getByLabel(/Acepto los términos/).check();
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  // Tras registrarse vuelve al curso que quería reservar.
  await expect(page).toHaveURL(new RegExp(`/es/cursos/${SLUG_ES}`));
  await page.getByRole("button", { name: "Reservar mi plaza" }).click();
  await expect(page).toHaveURL(/\/es\/mi-cuenta\/reservas\//);
  await expect(page.getByText("Pendiente de pago").first()).toBeVisible();
  await expect(page.getByText(/Tiempo para pagar/)).toBeVisible();
  await page.getByRole("button", { name: "Pagar ahora" }).click();
  await expect(page.getByRole("heading", { name: "Pasarela de pago de pruebas" })).toBeVisible();
  await page.getByRole("button", { name: "Simular pago exitoso" }).click();
  await expect(page).toHaveURL(/\/es\/mi-cuenta$/);
  await expect(page.getByText("Pendiente de aprobación").first()).toBeVisible();
});

test("seguridad: un cliente no entra en administración", async ({ page }) => {
  await login(page, client.email, client.password);
  await page.goto("/es/admin");
  await expect(page.getByText("No tienes acceso a esta sección.")).toBeVisible();
});

test("admin aprueba y el cliente ve su plaza confirmada con QR", async ({ page, browser }) => {
  test.skip(!ADMIN.email, "Define E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD");
  await login(page, ADMIN.email, ADMIN.password);
  await page.goto("/es/admin/bookings");
  const row = page.getByRole("row", { name: new RegExp(client.email) });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Aprobar" }).click();
  await expect(page.getByRole("row", { name: new RegExp(client.email) })).toHaveCount(0); // sale de "pendientes"

  const ctx = await browser.newContext();
  const clientPage = await ctx.newPage();
  await login(clientPage, client.email, client.password);
  await clientPage.goto("/es/mi-cuenta");
  await clientPage.getByRole("link", { name: "Pan de masa madre" }).first().click();
  await expect(clientPage.getByText("Confirmada").first()).toBeVisible();
  await expect(clientPage.getByRole("img", { name: "Tu código QR" })).toBeVisible();
  await ctx.close();
});

test("admin crea un curso, cambia su foto y los datos y se conservan categoría y sede", async ({ page }) => {
  const name = `Curso E2E ${stamp}`;
  const when = new Date(Date.now() + 10 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  await login(page, ADMIN.email, ADMIN.password);

  // Crear
  await page.goto("/es/admin/courses/new");
  await page.getByLabel("Nombre (español)").fill(name);
  await page.getByLabel("Descripción corta (español)").fill("Corto");
  await page.getByLabel("Descripción completa (español)").fill("Descripción completa del curso de prueba");
  await expect(page.getByLabel("Sede").locator("option")).not.toHaveCount(0);
  await page.getByLabel("Categoría").selectOption({ index: 2 });
  const category = await page.getByLabel("Categoría").inputValue(); // lo elegido al crear
  const venue = await page.getByLabel("Sede").inputValue();
  await page.getByLabel("Inicio (hora de Bogotá)").fill(`${when}T10:00`);
  await page.getByLabel("Fin (hora de Bogotá)").fill(`${when}T12:00`);
  await page.getByLabel("Capacidad").fill("5");
  await page.getByLabel("Precio (en pesos)").fill("50000");
  await page.getByRole("button", { name: "Crear curso" }).click();
  await page.waitForURL(/\/es\/admin\/courses$/);
  await expect(page.getByText(name).first()).toBeVisible();

  // Editar: la foto exige descripción y solo admite https
  await page.getByRole("row").filter({ hasText: name }).getByRole("link", { name: "Editar" }).click();
  await expect(page.getByRole("heading", { name: "Editar curso" })).toBeVisible();
  await expect(page.getByLabel("Categoría")).toHaveValue(category); // la edición carga lo guardado, no la 1.ª opción
  await expect(page.getByLabel("Sede")).toHaveValue(venue);
  await page.getByLabel("Dirección de la foto (https://…)").fill("http://inseguro.example.com/a.jpg");
  await page.getByLabel("Descripción de la foto", { exact: true }).fill("Una foto de prueba");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Revisa los campos marcados")).toBeVisible(); // http no se acepta

  await page.getByLabel("Dirección de la foto (https://…)").fill("https://institutointer.com/wp-content/uploads/2018/08/Curso-mec%C3%A1nica-en-castellon.jpg");
  await page.getByLabel("Capacidad").fill("8");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados")).toBeVisible();

  // Recargar: todo persiste y categoría/sede no han cambiado solas
  await page.reload();
  await expect(page.getByLabel("Capacidad")).toHaveValue("8");
  await expect(page.getByLabel("Dirección de la foto (https://…)")).toHaveValue(/institutointer\.com/);
  await expect(page.getByLabel("Categoría")).toHaveValue(category);
  await expect(page.getByLabel("Sede")).toHaveValue(venue);

  // Dejar la foto vacía la quita
  await page.getByLabel("Dirección de la foto (https://…)").fill("");
  await page.getByLabel("Descripción de la foto", { exact: true }).fill("");
  await page.getByRole("button", { name: "Guardar cambios" }).click();
  await expect(page.getByText("Cambios guardados")).toBeVisible();
});
