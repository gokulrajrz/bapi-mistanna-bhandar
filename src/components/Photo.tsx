import { useEffect, useRef, useState, type CSSProperties } from "react";
export function Photo({
  src,
  alt = "",
  className = "",
  style,
  srcSet,
}: {
  src: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
  srcSet?: string;
}) {
  const element = useRef<HTMLSpanElement>(null);
  const [visible, setVisible] = useState(false);
  const legacy = src.match(/sweet-(\d)\.webp$/);
  const sheet = src.match(/(\/images\/sweets(?:-\d)?\.webp)#([0-3])$/);
  const atlas = sheet?.[1] || (legacy ? "/images/sweets.webp" : null);
  const n = sheet ? Number(sheet[2]) : legacy ? Number(legacy[1]) - 1 : 0;
  useEffect(() => {
    if (!atlas || !element.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "300px" },
    );
    observer.observe(element.current);
    return () => observer.disconnect();
  }, [atlas]);
  if (!atlas)
    return (
      <img
        className={className}
        src={src}
        srcSet={
          srcSet ||
          (src === "/images/hero.webp"
            ? "/images/hero-small.webp 768w, /images/hero.webp 1536w"
            : undefined)
        }
        sizes="(max-width: 540px) 100vw, (max-width: 900px) 50vw, 33vw"
        alt={alt}
        loading="lazy"
        decoding="async"
        width={600}
        height={600}
        style={style}
      />
    );
  return (
    <span
      ref={element}
      role="img"
      aria-label={alt || "Illustrative sweet photography"}
      className={`sweet-photo ${className}`}
      style={{
        backgroundImage: visible
          ? `image-set(url("${atlas.replace(".webp", "-small.webp")}") 1x, url("${atlas}") 2x)`
          : undefined,
        backgroundPosition: `${(n % 2) * 100}% ${Math.floor(n / 2) * 100}%`,
        ...style,
      }}
    />
  );
}
