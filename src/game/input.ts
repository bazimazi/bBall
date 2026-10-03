import type { Side } from './types';

interface Gesture {
  side: Side;
  x: number;
  y: number;
  started: number;
  serving: boolean;
  moved: boolean;
  fieldY?: number;
}

/** One owner per paddle. Lifting or cancelling a drag never counts as a serve. */
export class PointerTracker {
  private readonly gestures = new Map<number, Gesture>();

  begin(id: number, x: number, y: number, time: number, side: Side, serving: boolean): boolean {
    if ([...this.gestures.values()].some((gesture) => gesture.side === side)) return false;
    this.gestures.set(id, { side, x, y, started: time, serving, moved: false });
    return true;
  }

  move(id: number, x: number, y: number): Side | undefined {
    const gesture = this.gestures.get(id);
    if (!gesture) return undefined;
    if (Math.hypot(x - gesture.x, y - gesture.y) > 12) gesture.moved = true;
    return gesture.side;
  }

  /** Incremental movement permits immediate reversal after reaching a wall. */
  dragTarget(id: number, fieldY: number, target: number, sensitivity: number): number {
    const gesture = this.gestures.get(id);
    if (!gesture) return target;
    const previous = gesture.fieldY ?? fieldY;
    gesture.fieldY = fieldY;
    return target + (fieldY - previous) * sensitivity;
  }

  end(id: number, x: number, y: number, time: number): boolean {
    this.move(id, x, y);
    const gesture = this.gestures.get(id);
    this.gestures.delete(id);
    return !!gesture && gesture.serving && !gesture.moved && time - gesture.started <= 500;
  }

  cancel(id: number): void {
    this.gestures.delete(id);
  }

  clear(): void {
    this.gestures.clear();
  }
}
