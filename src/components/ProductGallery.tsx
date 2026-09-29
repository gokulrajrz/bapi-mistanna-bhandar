import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { Photo } from "./Photo";
import { Dialog } from "./ui";
export function ProductGallery({
  images,
  name,
  srcSets,
}: {
  images: string[];
  name: string;
  srcSets?: string[];
}) {
  const [active, setActive] = useState(0),
    [zoom, setZoom] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  function select(i: number) {
    setActive(i);
    rail.current?.scrollTo({
      left: i * rail.current.clientWidth,
      behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  return (
    <>
      <div className="gallery" aria-label={`${name} photo gallery`}>
        <div
          className="gallery-rail"
          ref={rail}
          onScroll={(e) =>
            setActive(
              Math.round(
                e.currentTarget.scrollLeft / e.currentTarget.clientWidth,
              ),
            )
          }
        >
          {images.map((src, i) => (
            <button
              className="gallery-slide"
              key={`${src}-${i}`}
              onClick={() => {
                setActive(i);
                setZoom(true);
              }}
              aria-label={`Enlarge ${name} image ${i + 1}`}
            >
              <Photo
                src={src}
                srcSet={srcSets?.[i]}
                alt={`${name}, view ${i + 1}`}
              />
              <ZoomIn size={21} />
            </button>
          ))}
        </div>
        {images.length > 1 && (
          <div className="gallery-controls">
            <button
              className="icon-button"
              aria-label="Previous photo"
              disabled={active === 0}
              onClick={() => select(active - 1)}
            >
              <ChevronLeft size={19} />
            </button>
            <span aria-live="polite">
              {active + 1} / {images.length}
            </span>
            <button
              className="icon-button"
              aria-label="Next photo"
              disabled={active === images.length - 1}
              onClick={() => select(active + 1)}
            >
              <ChevronRight size={19} />
            </button>
          </div>
        )}
      </div>
      <div className="thumbnails">
        {images.map((src, i) => (
          <button
            className={i === active ? "selected" : ""}
            key={`${src}-${i}`}
            aria-label={`View image ${i + 1}`}
            aria-pressed={i === active}
            onClick={() => select(i)}
          >
            <Photo src={src} alt="" />
          </button>
        ))}
      </div>
      {zoom && (
        <Dialog title={name} onClose={() => setZoom(false)}>
          <div className="image-zoom">
            <Photo src={images[active]} alt={name} />
          </div>
          <p className="muted">Scroll or pinch to inspect the image.</p>
        </Dialog>
      )}
    </>
  );
}
