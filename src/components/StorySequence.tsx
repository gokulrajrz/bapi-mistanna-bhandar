import { useEffect, useRef } from "react";
export function StorySequence({
  steps,
  motion,
}: {
  steps: string[];
  motion: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (
      !root ||
      !motion ||
      !("IntersectionObserver" in window) ||
      matchMedia("(prefers-reduced-motion: reduce)").matches
    )
      return;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries)
          if (entry.isIntersecting) {
            entry.target.classList.add("story-step-arrived");
            observer.unobserve(entry.target);
          }
      },
      { threshold: 0.25 },
    );
    for (const child of root.children) observer.observe(child);
    return () => {
      observer.disconnect();
      for (const child of root.children)
        child.classList.remove("story-step-arrived");
    };
  }, [steps, motion]);
  return (
    <div className="making-sequence" ref={ref}>
      {steps.map((word, i) => (
        <div key={`${i}-${word}`}>
          <small>0{i + 1}</small>
          <h3>{word}</h3>
        </div>
      ))}
    </div>
  );
}
