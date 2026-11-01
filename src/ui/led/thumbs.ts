import { CELLS, COLS, ROWS, createFrame, type Frame, type Program } from '../../types';
import { BLUE_STOPS, FACE_RGB, GOLD_STOPS, WELL_RGB, type Rgb } from './palette';

/** Device pixels per cell: three lit, one gap, so a thumbnail still reads as a lattice. */
const SCALE = 4;
export const THUMB_WIDTH = COLS * SCALE;
export const THUMB_HEIGHT = ROWS * SCALE;

const pack = ([r, g, b]: Rgb, alpha = 255): number =>
  ((alpha << 24) | (Math.round(b) << 16) | (Math.round(g) << 8) | Math.round(r)) >>> 0;

const scale = ([r, g, b]: Rgb, k: number): Rgb => [r * k, g * k, b * k];

function buildSprites(): readonly Uint32Array[] {
  const face = pack(FACE_RGB);
  const off = new Uint32Array(SCALE * SCALE).fill(face);
  off[SCALE + 1] = pack(WELL_RGB);
  const sprites: Uint32Array[] = [];
  for (let level = -4; level <= 4; level++) {
    if (level === 0) {
      sprites.push(off);
      continue;
    }
    const stops = level > 0 ? GOLD_STOPS : BLUE_STOPS;
    const color = stops[Math.abs(level) - 1] as Rgb;
    const sprite = new Uint32Array(SCALE * SCALE).fill(face);
    for (let y = 0; y < SCALE - 1; y++) {
      for (let x = 0; x < SCALE - 1; x++) {
        const corner = (x === 0 || x === 2) && (y === 0 || y === 2);
        sprite[y * SCALE + x] = pack(level > 0 && corner ? scale(color, 0.42) : color);
      }
    }
    sprites.push(sprite);
  }
  return sprites;
}

let sharedSprites: readonly Uint32Array[] | null = null;

export interface FramePainter {
  paint(frame: Frame): void;
}

export function createFramePainter(canvas: HTMLCanvasElement): FramePainter {
  canvas.width = THUMB_WIDTH;
  canvas.height = THUMB_HEIGHT;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2d context unavailable');
  const image = ctx.createImageData(THUMB_WIDTH, THUMB_HEIGHT);
  const pixels = new Uint32Array(image.data.buffer);
  sharedSprites ??= buildSprites();
  const sprites = sharedSprites;

  return {
    paint(frame) {
      for (let i = 0; i < CELLS; i++) {
        const sprite = sprites[(frame[i] as number) + 4] as Uint32Array;
        const originX = (i % COLS) * SCALE;
        const originY = Math.floor(i / COLS) * SCALE;
        for (let y = 0; y < SCALE; y++) {
          const row = (originY + y) * THUMB_WIDTH + originX;
          for (let x = 0; x < SCALE; x++) pixels[row + x] = sprite[y * SCALE + x] as number;
        }
      }
      ctx.putImageData(image, 0, 0);
    },
  };
}

export interface ThumbHandle {
  setProgram(program: Program): void;
  remove(): void;
}

export interface ThumbPool {
  /** rate is cycles per second of the thumbnail's own loop. */
  add(canvas: HTMLCanvasElement, program: Program, rate?: number): ThumbHandle;
  tick(now: number): void;
}

interface Entry {
  readonly canvas: HTMLCanvasElement;
  readonly painter: FramePainter;
  program: Program;
  rate: number;
  visible: boolean;
  drawnAt: number;
}

const PER_TICK = 2;
/** Four updates a second cannot make more than two flashes, whatever a program does. */
const MIN_UPDATE_MS = 250;

/** Thumbnails take turns so a long queue never costs the wall a frame. */
export function createThumbPool(reduced: boolean): ThumbPool {
  const entries: Entry[] = [];
  const scratch = createFrame();
  let cursor = 0;

  const observer = new IntersectionObserver((records) => {
    for (const record of records) {
      const entry = entries.find((candidate) => candidate.canvas === record.target);
      if (entry) entry.visible = record.isIntersecting;
    }
  });

  const draw = (entry: Entry, now: number): void => {
    const t = reduced ? 0 : (now / 1000) * entry.rate;
    entry.program.render(t, scratch);
    entry.painter.paint(scratch);
    entry.drawnAt = now;
  };

  return {
    add(canvas, program, rate = 2.4) {
      const entry: Entry = {
        canvas,
        painter: createFramePainter(canvas),
        program,
        rate,
        visible: true,
        drawnAt: 0,
      };
      entries.push(entry);
      observer.observe(canvas);
      draw(entry, performance.now());
      return {
        setProgram(next) {
          entry.program = next;
          if (reduced) draw(entry, performance.now());
        },
        remove() {
          observer.unobserve(canvas);
          const index = entries.indexOf(entry);
          if (index >= 0) entries.splice(index, 1);
        },
      };
    },
    tick(now) {
      if (reduced || entries.length === 0) return;
      let drawn = 0;
      for (let seen = 0; seen < entries.length && drawn < PER_TICK; seen++) {
        cursor = (cursor + 1) % entries.length;
        const entry = entries[cursor];
        if (!entry || !entry.visible || now - entry.drawnAt < MIN_UPDATE_MS) continue;
        draw(entry, now);
        drawn += 1;
      }
    },
  };
}
