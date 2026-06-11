"use client";

import { useEffect, useState } from "react";

/** Large mono score with an animated count-up (static under reduced motion). */
export function ScoreCountUp({ score }: { score: number }) {
  const [shown, setShown] = useState(0);

  useEffect(() => {
    // Reduced motion → a single frame straight to the final value.
    const duration = window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 0
      : 900;
    const start = performance.now();
    let frame: number;
    const tick = (now: number) => {
      const t = duration === 0 ? 1 : Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(Math.round(eased * score));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [score]);

  return (
    <p className="font-mono text-6xl font-bold tabular-nums leading-none" aria-label={`Visibility score ${score} out of 100`}>
      <span aria-hidden>{shown}</span>
      <span aria-hidden className="text-2xl font-medium text-muted">
        /100
      </span>
    </p>
  );
}
