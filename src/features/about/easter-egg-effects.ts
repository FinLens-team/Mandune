type EffectType =
  | "rings"
  | "poly"
  | "spiral"
  | "rays"
  | "confetti"
  | "zigzag"
  | "pop"
  | "cross"
  | "orbit"
  | "wave"
  | "stars"
  | "grid";

type PieceKind = "circle" | "ring" | "square" | "triangle" | "diamond" | "hexagon" | "star";

const EFFECT_TYPES: readonly EffectType[] = [
  "rings", "poly", "spiral", "rays", "confetti", "zigzag",
  "pop", "cross", "orbit", "wave", "stars", "grid",
];
const COLORS = {
  amber: "#ffb400",
  gray: "#87837e",
  coral: "#ff5a5f",
  teal: "#16c2a3",
  blue: "#3e7bfa",
} as const;
const ACCENTS = [COLORS.coral, COLORS.teal, COLORS.blue] as const;
const EFFECT_ENTER_SECONDS = 0.55;
const EFFECT_EXIT_SECONDS = 0.4;

interface EffectInstance {
  centerX: number;
  centerY: number;
  data: unknown;
  direction: -1 | 1;
  exitStartedAt: number;
  rotation: number;
  startedAt: number;
  state: "enter" | "exit";
  type: EffectType;
}

interface EffectDefinition {
  build: (random: () => number, width: number, height: number) => unknown;
  draw: (
    context: CanvasRenderingContext2D,
    instance: EffectInstance,
    elapsed: number,
    fade: number,
    pulse: number,
    width: number,
    height: number,
  ) => void;
}

interface RingsData {
  dotRadius: number;
  shapes: Array<{ color: string; delay: number; radius: number; width: number }>;
}

interface PolyData {
  shapes: Array<{ color: string; delay: number; radius: number; sides: number; width: number }>;
}

interface SpiralData {
  shapes: Array<{ angle: number; color: string; delay: number; radius: number; size: number }>;
}

interface RaysData {
  innerRadius: number;
  shapes: Array<{ angle: number; color: string; delay: number; length: number; width: number }>;
}

interface ConfettiData {
  shapes: Array<{
    angle: number;
    color: string;
    delay: number;
    distance: number;
    kind: PieceKind;
    size: number;
    spin: number;
  }>;
}

interface Point { x: number; y: number }

interface ZigzagData {
  color: string;
  lengths: number[];
  points: Point[];
  total: number;
  width: number;
}

interface PopData {
  shapes: Array<{ color: string; delay: number; kind: PieceKind; rotation: number; size: number; x: number; y: number }>;
}

interface CrossData { color: string; size: number; width: number }

interface OrbitData {
  coreRadius: number;
  shapes: Array<{
    angle: number;
    color: string;
    delay: number;
    kind: PieceKind;
    radius: number;
    size: number;
    speed: number;
  }>;
}

interface WaveData {
  shapes: Array<{
    amplitude: number;
    color: string;
    delay: number;
    direction: -1 | 1;
    speed: number;
    thickness: number;
    wavelength: number;
    y: number;
  }>;
}

interface StarsData {
  shapes: Array<{ color: string; delay: number; radius: number; rotation: number; x: number; y: number }>;
}

interface GridData {
  lines: Array<{ color: string; delay: number; width: number; y: number }>;
  radius: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const smooth = (value: number) => value * value * (3 - 2 * value);
const easeOutCubic = (value: number) => 1 - Math.pow(1 - value, 3);
const easeOutBack = (value: number) => {
  const coefficient = 1.70158;
  const shifted = value - 1;
  return 1 + (coefficient + 1) * shifted ** 3 + coefficient * shifted ** 2;
};
const easeOutElastic = (value: number) => value <= 0
  ? 0
  : value >= 1
    ? 1
    : Math.pow(2, -10 * value) * Math.sin((value * 10 - 0.75) * (2 * Math.PI / 3)) + 1;
const progress = (elapsed: number, delay: number, duration = EFFECT_ENTER_SECONDS) =>
  clamp01((elapsed - delay) / duration);

function seededRandom(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state |= 0;
    state = state + 0x6d2b79f5 | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value = value + Math.imul(value ^ value >>> 7, 61 | value) ^ value;
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pickColor(random: () => number): string {
  const value = random();
  if (value < 0.62) return COLORS.amber;
  if (value < 0.9) return COLORS.gray;
  return ACCENTS[Math.floor(random() * ACCENTS.length)]!;
}

function tracePolygon(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  sides: number,
  rotation: number,
) {
  context.beginPath();
  for (let index = 0; index < sides; index += 1) {
    const angle = rotation + index * 2 * Math.PI / sides;
    const pointX = x + Math.cos(angle) * radius;
    const pointY = y + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(pointX, pointY);
    else context.lineTo(pointX, pointY);
  }
  context.closePath();
}

function traceStar(
  context: CanvasRenderingContext2D,
  radius: number,
  rotation: number,
) {
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const currentRadius = index % 2 === 0 ? radius : radius * 0.46;
    const angle = rotation + index * Math.PI / 5;
    const x = Math.cos(angle) * currentRadius;
    const y = Math.sin(angle) * currentRadius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
}

function drawPiece(
  context: CanvasRenderingContext2D,
  kind: PieceKind,
  color: string,
  x: number,
  y: number,
  radius: number,
  rotation: number,
) {
  if (radius <= 0) return;
  context.save();
  context.translate(x, y);
  context.rotate(rotation);
  if (kind === "ring") {
    context.strokeStyle = color;
    context.lineWidth = Math.max(2, radius * 0.3);
    context.beginPath();
    context.arc(0, 0, radius, 0, Math.PI * 2);
    context.stroke();
  } else {
    context.fillStyle = color;
    if (kind === "circle") {
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
    } else if (kind === "square") {
      context.fillRect(-radius, -radius, radius * 2, radius * 2);
      context.restore();
      return;
    } else if (kind === "triangle") {
      tracePolygon(context, 0, 0, radius * 1.2, 3, -Math.PI / 2);
    } else if (kind === "diamond") {
      tracePolygon(context, 0, 0, radius * 1.15, 4, 0);
    } else if (kind === "hexagon") {
      tracePolygon(context, 0, 0, radius * 1.1, 6, 0);
    } else {
      traceStar(context, radius * 1.25, -Math.PI / 2);
    }
    context.fill();
  }
  context.restore();
}

function strokePartial(
  context: CanvasRenderingContext2D,
  points: readonly Point[],
  lengths: readonly number[],
  visibleLength: number,
): Point {
  const first = points[0]!;
  context.beginPath();
  context.moveTo(first.x, first.y);
  let accumulated = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]!;
    const point = points[index]!;
    const segment = lengths[index - 1]!;
    if (accumulated + segment <= visibleLength) {
      context.lineTo(point.x, point.y);
      accumulated += segment;
    } else {
      const fraction = segment > 0 ? (visibleLength - accumulated) / segment : 0;
      const tip = {
        x: previous.x + (point.x - previous.x) * fraction,
        y: previous.y + (point.y - previous.y) * fraction,
      };
      context.lineTo(tip.x, tip.y);
      return tip;
    }
  }
  return points.at(-1)!;
}

const EFFECTS: Readonly<Record<EffectType, EffectDefinition>> = {
  rings: {
    build(random, width, height): RingsData {
      const minimum = Math.min(width, height);
      return {
        dotRadius: minimum * 0.07,
        shapes: Array.from({ length: 7 }, (_, index) => ({
          color: pickColor(random),
          delay: index * 0.05,
          radius: minimum * (0.13 + random() * 0.29),
          width: 5 + random() * 9,
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse, width, height) {
      const data = instance.data as RingsData;
      const minimum = Math.min(width, height);
      data.shapes.forEach((shape, index) => {
        const amount = easeOutCubic(progress(elapsed, shape.delay));
        if (amount <= 0) return;
        const radius = amount * shape.radius * (1 + 0.04 * Math.sin(elapsed * 1.4 + index)) + pulse * minimum * 0.012;
        context.globalAlpha = (1 - amount * 0.5) * fade;
        context.strokeStyle = shape.color;
        context.lineWidth = shape.width * (1 + pulse * 0.5);
        context.beginPath();
        context.arc(instance.centerX, instance.centerY, radius, 0, Math.PI * 2);
        context.stroke();
      });
      const dot = easeOutBack(progress(elapsed, 0));
      context.globalAlpha = fade;
      context.fillStyle = COLORS.amber;
      context.beginPath();
      context.arc(instance.centerX, instance.centerY, data.dotRadius * dot * (1 + pulse * 0.2), 0, Math.PI * 2);
      context.fill();
    },
  },
  poly: {
    build(random, width, height): PolyData {
      const minimum = Math.min(width, height);
      const sides = 3 + Math.floor(random() * 5);
      return {
        shapes: [
          { color: COLORS.amber, delay: 0, radius: minimum * 0.46, sides, width: minimum * 0.034 },
          { color: COLORS.gray, delay: 0.09, radius: minimum * 0.3, sides, width: minimum * 0.027 },
          { color: COLORS.amber, delay: 0.18, radius: minimum * 0.17, sides, width: minimum * 0.02 },
        ],
      };
    },
    draw(context, instance, elapsed, fade, pulse, width, height) {
      const data = instance.data as PolyData;
      const minimum = Math.min(width, height);
      data.shapes.forEach((shape, index) => {
        const amount = easeOutCubic(progress(elapsed, shape.delay));
        const radius = amount * shape.radius * (1 + pulse * 0.035 + 0.03 * Math.sin(elapsed * 1.1 + index * 1.9));
        context.globalAlpha = (1 - amount * 0.3) * fade;
        context.strokeStyle = shape.color;
        context.lineWidth = shape.width * (1 + pulse * 0.4) + pulse * minimum * 0.0015;
        tracePolygon(
          context,
          instance.centerX,
          instance.centerY,
          radius,
          shape.sides,
          instance.rotation + instance.direction * (1 - amount) * 1.3 + elapsed * 0.18 * instance.direction,
        );
        context.stroke();
      });
    },
  },
  spiral: {
    build(random, width, height): SpiralData {
      const minimum = Math.min(width, height);
      return {
        shapes: Array.from({ length: 36 }, (_, index) => ({
          angle: index * 0.55,
          color: pickColor(random),
          delay: index * 0.018,
          radius: 6 + index * minimum * 0.0125,
          size: minimum * (0.009 + index * 0.0008),
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as SpiralData;
      const rotation = instance.rotation + elapsed * 0.45 * instance.direction + pulse * 0.05 * instance.direction;
      data.shapes.forEach((shape, index) => {
        const amount = easeOutBack(progress(elapsed, shape.delay));
        const angle = shape.angle + rotation;
        const radius = shape.radius * amount * (1 + pulse * 0.04) + Math.sin(elapsed * 1.5 + index * 0.5) * 4;
        context.globalAlpha = fade;
        drawPiece(
          context,
          index % 6 === 5 ? "square" : "circle",
          shape.color,
          instance.centerX + Math.cos(angle) * radius,
          instance.centerY + Math.sin(angle) * radius,
          shape.size * amount * (1 + pulse * 0.25),
          angle,
        );
      });
    },
  },
  rays: {
    build(random, width, height): RaysData {
      const minimum = Math.min(width, height);
      const count = 13 + Math.floor(random() * 4);
      return {
        innerRadius: minimum * 0.06,
        shapes: Array.from({ length: count }, (_, index) => ({
          angle: index / count * 2 * Math.PI + random() * 0.15,
          color: random() < 0.12 ? ACCENTS[Math.floor(random() * 3)]! : index % 2 ? COLORS.gray : COLORS.amber,
          delay: random() * 0.12,
          length: minimum * (0.36 + random() * 0.1),
          width: 0.09 + random() * 0.13,
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as RaysData;
      for (const shape of data.shapes) {
        const amount = easeOutCubic(progress(elapsed, shape.delay, 0.5));
        const rotation = instance.rotation + instance.direction * (1 - amount) * 0.8 + elapsed * 0.14 * instance.direction;
        const angle = shape.angle + rotation;
        context.globalAlpha = 0.88 * fade;
        context.fillStyle = shape.color;
        context.beginPath();
        context.moveTo(instance.centerX, instance.centerY);
        context.arc(
          instance.centerX,
          instance.centerY,
          data.innerRadius + shape.length * amount * (1 + pulse * 0.09),
          angle - shape.width,
          angle + shape.width,
        );
        context.closePath();
        context.fill();
      }
    },
  },
  confetti: {
    build(random, width, height): ConfettiData {
      const minimum = Math.min(width, height);
      const maximum = Math.hypot(width, height);
      const kinds: PieceKind[] = ["square", "circle", "triangle", "diamond"];
      return {
        shapes: Array.from({ length: 30 }, () => ({
          angle: random() * 2 * Math.PI,
          color: pickColor(random),
          delay: random() * 0.18,
          distance: maximum * (0.12 + random() * 0.46),
          kind: kinds[Math.floor(random() * kinds.length)]!,
          size: minimum * (0.026 + random() * 0.05),
          spin: (1 + random() * 2) * 2.2,
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as ConfettiData;
      data.shapes.forEach((shape, index) => {
        const amount = easeOutBack(progress(elapsed, shape.delay));
        const distance = shape.distance * amount * (1 + pulse * 0.025);
        context.globalAlpha = fade;
        drawPiece(
          context,
          shape.kind,
          shape.color,
          instance.centerX + Math.cos(shape.angle) * distance,
          instance.centerY + Math.sin(shape.angle) * distance + Math.sin(elapsed * 2.2 + index * 1.3) * 6,
          shape.size * amount * (1 + pulse * 0.18),
          shape.spin * amount * instance.direction + elapsed * 0.6 * instance.direction,
        );
      });
    },
  },
  zigzag: {
    build(random, width, height): ZigzagData {
      const minimum = Math.min(width, height);
      const horizontal = random() < 0.5;
      const count = 5 + Math.floor(random() * 3);
      const points = Array.from({ length: count + 1 }, (_, index) => {
        const fraction = index / count;
        return horizontal
          ? {
              x: -width * 0.08 + fraction * width * 1.16,
              y: height * (index % 2 ? 0.72 + random() * 0.14 : 0.14 + random() * 0.14),
            }
          : {
              x: width * (index % 2 ? 0.7 + random() * 0.16 : 0.14 + random() * 0.16),
              y: -height * 0.08 + fraction * height * 1.16,
            };
      });
      const lengths: number[] = [];
      let total = 0;
      for (let index = 1; index < points.length; index += 1) {
        const previous = points[index - 1]!;
        const point = points[index]!;
        const length = Math.hypot(point.x - previous.x, point.y - previous.y);
        lengths.push(length);
        total += length;
      }
      return { color: COLORS.amber, lengths, points, total, width: minimum * (0.026 + random() * 0.024) };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as ZigzagData;
      const amount = easeOutCubic(progress(elapsed, 0, 0.6));
      context.save();
      context.translate(0, Math.sin(elapsed * 1.6) * 7);
      context.lineJoin = "round";
      context.lineCap = "round";
      context.save();
      context.translate(0, data.width * 2.1);
      context.globalAlpha = 0.4 * fade;
      context.strokeStyle = COLORS.gray;
      context.lineWidth = data.width * (1 + pulse * 0.2);
      strokePartial(context, data.points, data.lengths, amount * data.total);
      context.stroke();
      context.restore();
      context.globalAlpha = fade;
      context.strokeStyle = data.color;
      context.lineWidth = data.width * (1 + pulse * 0.3);
      const tip = strokePartial(context, data.points, data.lengths, amount * data.total);
      context.stroke();
      context.fillStyle = COLORS.gray;
      context.beginPath();
      context.arc(tip.x, tip.y, data.width * (1.1 + pulse * 0.45), 0, Math.PI * 2);
      context.fill();
      context.restore();
    },
  },
  pop: {
    build(random, width, height): PopData {
      const minimum = Math.min(width, height);
      const kinds: PieceKind[] = ["circle", "square", "ring", "triangle", "hexagon"];
      return {
        shapes: Array.from({ length: 16 }, () => ({
          color: pickColor(random),
          delay: random() * 0.28,
          kind: kinds[Math.floor(random() * kinds.length)]!,
          rotation: random() * Math.PI,
          size: minimum * (0.036 + random() * 0.06),
          x: width * (0.06 + random() * 0.88),
          y: height * (0.06 + random() * 0.88),
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as PopData;
      data.shapes.forEach((shape, index) => {
        const amount = easeOutBack(progress(elapsed, shape.delay));
        context.globalAlpha = 0.96 * fade;
        drawPiece(
          context,
          shape.kind,
          shape.color,
          shape.x,
          shape.y + Math.sin(elapsed * 2 + index * 1.7) * 7,
          shape.size * amount * (1 + pulse * 0.2),
          shape.rotation + elapsed * 0.4 * instance.direction + pulse * 0.08 * instance.direction,
        );
      });
    },
  },
  cross: {
    build(random, width, height): CrossData {
      const minimum = Math.min(width, height);
      const size = minimum * (0.6 + random() * 0.25);
      return {
        color: random() < 0.2 ? ACCENTS[Math.floor(random() * 3)]! : COLORS.amber,
        size,
        width: size * (0.14 + random() * 0.08),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as CrossData;
      const horizontal = easeOutBack(progress(elapsed, 0));
      const vertical = easeOutBack(progress(elapsed, 0.13));
      context.save();
      context.translate(instance.centerX, instance.centerY);
      context.rotate(instance.rotation + instance.direction * (1 - horizontal) * 1.6 + Math.sin(elapsed * 1.3) * 0.07 + pulse * 0.02 * instance.direction);
      context.scale(1 + pulse * 0.12, 1 + pulse * 0.12);
      context.globalAlpha = fade;
      context.fillStyle = data.color;
      const halfLength = data.size / 2;
      const halfWidth = data.width / 2;
      context.fillRect(-halfLength * horizontal, -halfWidth, data.size * horizontal, data.width);
      context.fillRect(-halfWidth, -halfLength * vertical, data.width, data.size * vertical);
      context.globalAlpha = 0.6 * fade;
      context.strokeStyle = COLORS.gray;
      context.lineWidth = Math.max(2, data.width * 0.28);
      context.beginPath();
      context.arc(0, 0, data.size * 0.68 * horizontal * (1 + pulse * 0.08), 0, Math.PI * 2);
      context.stroke();
      context.restore();
    },
  },
  orbit: {
    build(random, width, height): OrbitData {
      const minimum = Math.min(width, height);
      const kinds: PieceKind[] = ["circle", "square", "triangle", "ring"];
      return {
        coreRadius: minimum * 0.055,
        shapes: Array.from({ length: 10 }, (_, index) => ({
          angle: index / 10 * 2 * Math.PI,
          color: pickColor(random),
          delay: random() * 0.15,
          kind: kinds[index % kinds.length]!,
          radius: minimum * (0.18 + random() * 0.24),
          size: minimum * (0.026 + random() * 0.032),
          speed: 0.45 + random() * 0.5,
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as OrbitData;
      for (const shape of data.shapes) {
        const amount = easeOutCubic(progress(elapsed, shape.delay));
        const angle = shape.angle + elapsed * shape.speed * instance.direction + instance.direction * (1 - amount) * 1.8;
        const radius = shape.radius * amount * (1 + pulse * 0.09);
        context.globalAlpha = fade;
        drawPiece(
          context,
          shape.kind,
          shape.color,
          instance.centerX + Math.cos(angle) * radius,
          instance.centerY + Math.sin(angle) * radius,
          shape.size * (0.6 + 0.4 * amount) * (1 + pulse * 0.15),
          elapsed * 1.2 * instance.direction,
        );
      }
      const core = easeOutBack(progress(elapsed, 0));
      context.globalAlpha = fade;
      drawPiece(context, "circle", COLORS.amber, instance.centerX, instance.centerY, data.coreRadius * core * (1 + pulse * 0.2), 0);
    },
  },
  wave: {
    build(random, width, height): WaveData {
      const minimum = Math.min(width, height);
      return {
        shapes: Array.from({ length: 4 }, (_, index) => ({
          amplitude: minimum * (0.03 + random() * 0.05),
          color: random() < 0.12 ? ACCENTS[Math.floor(random() * 3)]! : index % 2 ? COLORS.gray : COLORS.amber,
          delay: index * 0.08,
          direction: index % 2 ? 1 : -1,
          speed: 1 + random() * 1.2,
          thickness: minimum * (0.07 + random() * 0.06),
          wavelength: width * (0.45 + random() * 0.4),
          y: height * (0.14 + index * 0.24) + (random() - 0.5) * height * 0.08,
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse, width) {
      const data = instance.data as WaveData;
      const step = Math.max(14, width / 28);
      for (const shape of data.shapes) {
        const amount = easeOutCubic(progress(elapsed, shape.delay, 0.6));
        const offset = (1 - amount) * (width + 120) * shape.direction;
        const amplitude = shape.amplitude * (0.6 + 0.4 * amount) * (1 + pulse * 0.3);
        context.globalAlpha = 0.9 * fade;
        context.fillStyle = shape.color;
        context.beginPath();
        for (let x = -60; x <= width + 60; x += step) {
          const y = shape.y + Math.sin(x / shape.wavelength * Math.PI * 2 + elapsed * shape.speed * instance.direction) * amplitude;
          if (x === -60) context.moveTo(x + offset, y);
          else context.lineTo(x + offset, y);
        }
        for (let x = width + 60; x >= -60; x -= step) {
          const y = shape.y + shape.thickness * (1 + pulse * 0.12) +
            Math.sin(x / shape.wavelength * Math.PI * 2 + elapsed * shape.speed * instance.direction + 0.9) * amplitude;
          context.lineTo(x + offset, y);
        }
        context.closePath();
        context.fill();
      }
    },
  },
  stars: {
    build(random, width, height): StarsData {
      const minimum = Math.min(width, height);
      return {
        shapes: Array.from({ length: 12 }, () => ({
          color: pickColor(random),
          delay: random() * 0.25,
          radius: minimum * (0.034 + random() * 0.055),
          rotation: random() * Math.PI,
          x: width * (0.07 + random() * 0.86),
          y: height * (0.07 + random() * 0.86),
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as StarsData;
      data.shapes.forEach((shape, index) => {
        const amount = easeOutElastic(progress(elapsed, shape.delay));
        const twinkle = 1 + 0.15 * Math.sin(elapsed * 3.2 + index * 2.1) + pulse * 0.18;
        context.globalAlpha = 0.97 * fade;
        drawPiece(
          context,
          "star",
          shape.color,
          shape.x,
          shape.y,
          shape.radius * amount * twinkle,
          shape.rotation + elapsed * 0.7 * instance.direction,
        );
      });
    },
  },
  grid: {
    build(random, width, height): GridData {
      const minimum = Math.min(width, height);
      const radius = minimum * (0.4 + random() * 0.04);
      return {
        radius,
        lines: Array.from({ length: 11 }, (_, index) => ({
          color: index % 2 ? COLORS.gray : COLORS.amber,
          delay: index * 0.045,
          width: 4.5 + (index * 7 % 3) * 4,
          y: (index - 5) * (radius * 2 / 11),
        })),
      };
    },
    draw(context, instance, elapsed, fade, pulse) {
      const data = instance.data as GridData;
      const radius = data.radius * (1 + pulse * 0.06 + 0.03 * Math.sin(elapsed * 1.3));
      context.save();
      context.translate(instance.centerX, instance.centerY);
      context.rotate(instance.rotation + elapsed * 0.22 * instance.direction + pulse * 0.025 * instance.direction);
      context.beginPath();
      context.arc(0, 0, radius, 0, Math.PI * 2);
      context.clip();
      for (const line of data.lines) {
        const amount = easeOutCubic(progress(elapsed, line.delay));
        context.globalAlpha = 0.92 * fade;
        context.strokeStyle = line.color;
        context.lineWidth = line.width * (1 + pulse * 0.35);
        context.beginPath();
        context.moveTo(-radius * amount, line.y);
        context.lineTo(radius * amount, line.y);
        context.stroke();
      }
      context.restore();
      const outline = easeOutBack(progress(elapsed, 0));
      context.globalAlpha = fade;
      context.strokeStyle = COLORS.amber;
      context.lineWidth = 6 * (1 + pulse * 0.35);
      context.beginPath();
      context.arc(instance.centerX, instance.centerY, radius * outline, 0, Math.PI * 2);
      context.stroke();
    },
  },
};

export class EasterEggEffectsEngine {
  private animationFrame: number | null = null;
  private context: CanvasRenderingContext2D;
  private effects: EffectInstance[] = [];
  private effectIndex = Math.floor(Math.random() * EFFECT_TYPES.length);
  private height = 1;
  private lastFrame = performance.now() / 1000;
  private pop = 0;
  private popTarget = 0;
  private popVelocity = 0;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private resizeObserver: ResizeObserver;
  private width = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly jellyElement: HTMLElement,
    private readonly getBeatPulse: () => number,
  ) {
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas_context_unavailable");
    this.context = context;
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(document.documentElement);
    this.resize();
  }

  trigger(): void {
    if (this.animationFrame === null) {
      this.lastFrame = performance.now() / 1000;
      this.animationFrame = requestAnimationFrame(this.frame);
    }
    this.popTarget = 1;
    this.popVelocity = Math.min(this.popVelocity + 5.2, 9);
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = setTimeout(() => {
      this.popTarget = 0;
    }, 280);
    const now = performance.now() / 1000;
    for (const effect of this.effects) {
      if (effect.state === "enter") {
        effect.state = "exit";
        effect.exitStartedAt = now;
      }
    }
    while (this.effects.length > 6) this.effects.shift();
    const type = EFFECT_TYPES[this.effectIndex % EFFECT_TYPES.length]!;
    this.effectIndex += 1;
    const random = seededRandom(Math.floor(Math.random() * 1_000_000_000));
    this.effects.push({
      centerX: this.width / 2,
      centerY: this.height / 2,
      data: EFFECTS[type].build(random, this.width, this.height),
      direction: random() < 0.5 ? -1 : 1,
      exitStartedAt: 0,
      rotation: random() * Math.PI * 2,
      startedAt: now,
      state: "enter",
      type,
    });
  }

  destroy(): void {
    if (this.animationFrame !== null) cancelAnimationFrame(this.animationFrame);
    this.animationFrame = null;
    this.resizeObserver.disconnect();
    if (this.releaseTimer) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.effects = [];
    this.context.clearRect(0, 0, this.width, this.height);
    this.jellyElement.style.transform = "";
  }

  private resize(): void {
    const density = Math.min(window.devicePixelRatio || 1, 2);
    this.width = Math.max(1, window.innerWidth);
    this.height = Math.max(1, window.innerHeight);
    this.canvas.width = Math.round(this.width * density);
    this.canvas.height = Math.round(this.height * density);
    this.context.setTransform(density, 0, 0, density, 0, 0);
    for (const effect of this.effects) {
      effect.centerX = this.width / 2;
      effect.centerY = this.height / 2;
    }
  }

  private frame = (timeMilliseconds: number): void => {
    const now = timeMilliseconds / 1000;
    const delta = Math.min(0.05, Math.max(0.001, now - this.lastFrame));
    this.lastFrame = now;
    const pulse = this.getBeatPulse();

    this.popVelocity += (this.popTarget - this.pop) * 320 * delta;
    this.popVelocity *= Math.exp(-13 * delta);
    this.popVelocity = Math.max(-10, Math.min(10, this.popVelocity));
    this.pop += this.popVelocity * delta;
    const sway = Math.sin(now * Math.PI * 1.2) * pulse;
    this.jellyElement.style.transform =
      `translate(${(sway * 5).toFixed(2)}px, ${(-9 * pulse).toFixed(2)}px) ` +
      `rotate(${(sway * 2.4 - 3.5 * this.pop).toFixed(2)}deg) ` +
      `scale(${(1 + 0.06 * pulse + 0.17 * this.pop).toFixed(4)}, ` +
      `${(1 - 0.05 * pulse + 0.17 * this.pop).toFixed(4)})`;

    this.context.clearRect(0, 0, this.width, this.height);
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index]!;
      let exitProgress = 0;
      if (effect.state === "exit") {
        exitProgress = clamp01((now - effect.exitStartedAt) / EFFECT_EXIT_SECONDS);
        if (exitProgress >= 1) {
          this.effects.splice(index, 1);
          continue;
        }
      }
      const elapsed = now - effect.startedAt;
      const fade = 1 - smooth(exitProgress);
      const scale = effect.state === "exit" ? 1 - 0.22 * exitProgress : 1 + pulse * 0.02;
      this.context.save();
      this.context.translate(effect.centerX, effect.centerY);
      this.context.scale(scale, scale);
      this.context.translate(-effect.centerX, -effect.centerY);
      EFFECTS[effect.type].draw(
        this.context,
        effect,
        elapsed,
        fade,
        pulse,
        this.width,
        this.height,
      );
      this.context.restore();
    }
    this.context.globalAlpha = 1;
    this.animationFrame = requestAnimationFrame(this.frame);
  };
}
