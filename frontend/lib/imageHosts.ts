/**
 * Servidores de imágenes permitidos para la optimización (Next redimensiona y convierte a WebP desde NUESTRO servidor).
 * Solo se permite una lista cerrada: un optimizador abierto a cualquier URL se podría abusar como proxy.
 * Para añadir más sin tocar código: variable IMAGE_HOSTS (nombres de host separados por comas).
 * Las imágenes de otros servidores se muestran igualmente, sin optimizar.
 */
const DEFAULT_HOSTS = [
  "tonypotter.es",
  "ieperiodismo.com",
  "www.cocinadelirante.com",
  "images.squarespace-cdn.com",
  "institutointer.com",
  "daler-rowney.com",
  "clubdelmacrame.com",
  "www.igi-la.com",
];

export const IMAGE_HOSTS: string[] = [
  ...DEFAULT_HOSTS,
  ...(process.env.IMAGE_HOSTS ?? "").split(",").map((h) => h.trim()).filter(Boolean),
];

export function isOptimizableImage(src: string): boolean {
  try {
    const u = new URL(src);
    return u.protocol === "https:" && IMAGE_HOSTS.includes(u.hostname);
  } catch {
    return false;
  }
}
