"use client";

import Image from "next/image";
import { useState } from "react";

type Props = {
  src: string;
  alt: string;
  /** ¿Se puede optimizar desde nuestro servidor? (host de la lista permitida; lo decide el servidor). */
  optimize: boolean;
  /** Imagen visible al cargar (arriba del todo): prioridad alta, sin carga diferida. */
  priority?: boolean;
  /** Anchura aproximada en pantalla, para que el navegador pida el tamaño justo. */
  sizes: string;
  className?: string;
};

const FIT = "object-cover object-[50%_30%]";

/**
 * Imagen de curso 16:9. Si el servidor de origen está permitido, la sirve redimensionada y en WebP desde NUESTRO
 * servidor (mucho menos peso). Si esa descarga falla (p. ej. el origen bloquea a los servidores), cae a la imagen
 * original en el navegador: la foto se ve igualmente.
 */
export function CourseImage({ src, alt, optimize, priority = false, sizes, className = "" }: Props) {
  const [fallback, setFallback] = useState(false);
  const [broken, setBroken] = useState(false);
  const box = `relative block aspect-video w-full overflow-hidden ${className}`;

  if (optimize && !fallback) {
    return (
      <span className={box}>
        <Image src={src} alt={alt} fill sizes={sizes} priority={priority} quality={75} className={FIT} onError={() => setFallback(true)} />
      </span>
    );
  }
  if (broken) {
    // Ni la versión optimizada ni la original cargan (el origen bloquea o ya no existe): cuadro de color, sin icono de imagen rota.
    return (
      <span aria-hidden="true" className={`${box} flex items-center justify-center bg-brand-soft text-5xl`}>
        🎨
      </span>
    );
  }
  return (
    <span className={box}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        onError={() => setBroken(true)}
        className={`absolute inset-0 size-full ${FIT}`}
      />
    </span>
  );
}
