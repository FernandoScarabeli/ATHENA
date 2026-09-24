import { useEffect, useRef, useState } from "react";

type Point = { id: string; label: string; x: number; y: number; impact?: boolean };

const points: Point[] = [
  { id: "req", label: "REQ-142", x: 0.5, y: 0.45, impact: true },
  { id: "criterion", label: "AC-04", x: 0.73, y: 0.25 },
  { id: "document", label: "Documento", x: 0.22, y: 0.7 },
  { id: "rule", label: "Regra", x: 0.73, y: 0.72 },
  { id: "story", label: "REQ-087", x: 0.3, y: 0.22 },
  { id: "pull", label: "Pull request", x: 0.87, y: 0.5 },
];

const edges: Array<[string, string]> = [
  ["req", "criterion"],
  ["req", "document"],
  ["req", "rule"],
  ["req", "story"],
  ["criterion", "pull"],
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export function RequirementConstellation({ compact = false }: { compact?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | undefined>(undefined);
  const visibleRef = useRef(true);
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const reduced = prefersReducedMotion();
    const section = canvas.closest(".constellation-frame");
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(
      ([entry]) => { visibleRef.current = entry.isIntersecting; },
      { threshold: 0.08 },
    );
    if (section && observer) observer.observe(section);

    const draw = (now = 0) => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const width = Math.max(1, bounds.width);
      const height = Math.max(1, bounds.height);
      if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
      }
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.clearRect(0, 0, width, height);
      const pulse = reduced ? 0.55 : (Math.sin(now / 950) + 1) / 2;
      const wave = reduced ? -1 : (now % 11000) / 11000;
      const pointer = pointerRef.current;
      const position = (point: Point) => {
        const parallax = pointer && !reduced
          ? ((pointer.x / width) - 0.5) * (point.x - 0.5) * 12
          : 0;
        return { x: point.x * width + parallax, y: point.y * height };
      };

      context.lineWidth = 1;
      edges.forEach(([fromId, toId], index) => {
        const from = position(points.find((point) => point.id === fromId)!);
        const to = position(points.find((point) => point.id === toId)!);
        const affected = fromId === "req" || toId === "req";
        const emphasis = hovered ? fromId === hovered || toId === hovered : affected;
        context.strokeStyle = emphasis ? "rgba(92, 108, 120, .62)" : "rgba(170, 181, 189, .44)";
        context.beginPath();
        context.moveTo(from.x, from.y);
        context.lineTo(to.x, to.y);
        context.stroke();
        if (!reduced && affected && wave > index * 0.09 && wave < index * 0.09 + 0.17) {
          const progress = (wave - index * 0.09) / 0.17;
          context.fillStyle = "#c76a27";
          context.beginPath();
          context.arc(from.x + (to.x - from.x) * progress, from.y + (to.y - from.y) * progress, 2.2, 0, Math.PI * 2);
          context.fill();
        }
      });

      points.forEach((point) => {
        const { x, y } = position(point);
        const active = point.id === "req";
        const highlighted = hovered ? point.id === hovered || edges.some(([a, b]) => (a === hovered && b === point.id) || (b === hovered && a === point.id)) : active;
        const radius = active ? 8 + pulse * 1.3 : highlighted ? 6.2 : 4.5;
        if (active) {
          context.fillStyle = `rgba(199, 106, 39, ${0.09 + pulse * 0.08})`;
          context.beginPath();
          context.arc(x, y, 22 + pulse * 5, 0, Math.PI * 2);
          context.fill();
        }
        context.fillStyle = active ? "#c76a27" : highlighted ? "#536775" : "#9aa7b0";
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = "#58646d";
        context.font = `600 ${compact ? 10 : 11}px Inter, system-ui, sans-serif`;
        context.textAlign = point.x > 0.75 ? "right" : "left";
        context.fillText(point.label, x + (point.x > 0.75 ? -10 : 10), y - 10);
      });
      if (!reduced && visibleRef.current) frameRef.current = requestAnimationFrame(draw);
    };

    const resize = new ResizeObserver(() => draw(performance.now()));
    resize.observe(canvas);
    draw(performance.now());
    return () => {
      observer?.disconnect();
      resize.disconnect();
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [compact, hovered]);

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const bounds = canvas.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    pointerRef.current = { x, y };
    const closest = points.find((point) => Math.hypot(point.x * bounds.width - x, point.y * bounds.height - y) < 28);
    setHovered(closest?.id ?? null);
  };

  return <canvas ref={canvasRef} className="constellation-canvas" aria-hidden="true" onPointerMove={handlePointerMove} onPointerLeave={() => { pointerRef.current = null; setHovered(null); }} />;
}
