// @vitest-environment jsdom

import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EditorCanvas } from './EditorCanvas';
import type { Rect } from '../types';

function dispatchPointer(
  target: Element,
  type: string,
  clientX: number,
  clientY: number,
  pointerId = 1,
) {
  const event = new Event(type, {
    bubbles: true,
  });

  Object.defineProperty(event, 'clientX', { value: clientX });
  Object.defineProperty(event, 'clientY', { value: clientY });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  Object.defineProperty(event, 'pointerType', { value: 'touch' });

  target.dispatchEvent(event);
}

describe('EditorCanvas', () => {
  const frame = {
    data: new Uint8ClampedArray(200 * 150 * 4),
    width: 200,
    height: 150,
  } as ImageData;
  let container: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);

    HTMLCanvasElement.prototype.getContext = vi.fn(
      () =>
        ({
          putImageData: vi.fn(),
          beginPath: vi.fn(),
          arc: vi.fn(),
          fill: vi.fn(),
          stroke: vi.fn(),
          strokeRect: vi.fn(),
          setLineDash: vi.fn(),
          moveTo: vi.fn(),
          lineTo: vi.fn(),
          closePath: vi.fn(),
          save: vi.fn(),
          restore: vi.fn(),
          translate: vi.fn(),
          rotate: vi.fn(),
          drawImage: vi.fn(),
          fillStyle: '',
          strokeStyle: '',
          lineWidth: 1,
        }) as unknown as CanvasRenderingContext2D,
    ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    container.remove();
    vi.restoreAllMocks();
  });

  it('keeps dragging the target after pointerleave when the canvas still has pointer capture', () => {
    const onTargetRectChange = vi.fn();
    const root = createRoot(container);
    const targetRect: Rect = { x: 40, y: 30, width: 80, height: 60 };

    act(() => {
      root.render(
        <EditorCanvas
          frame={frame}
          targetRect={targetRect}
          onTargetRectChange={onTargetRectChange}
        />,
      );
    });

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 150,
        right: 200,
        bottom: 150,
      }),
    });

    Object.defineProperty(canvas!, 'setPointerCapture', {
      value: vi.fn(),
    });
    Object.defineProperty(canvas!, 'releasePointerCapture', {
      value: vi.fn(),
    });
    Object.defineProperty(canvas!, 'hasPointerCapture', {
      value: vi.fn(() => true),
    });

    act(() => {
      dispatchPointer(canvas!, 'pointerdown', 80, 60);
    });

    act(() => {
      dispatchPointer(canvas!, 'pointerleave', 50, 40);
      dispatchPointer(canvas!, 'pointermove', 180, 130);
    });

    expect(onTargetRectChange).toHaveBeenCalled();
    expect(onTargetRectChange).toHaveBeenLastCalledWith({
      x: 120,
      y: 90,
      width: targetRect.width,
      height: targetRect.height,
    });

    act(() => {
      root.unmount();
    });
  });

  it('releases pointer capture on pointercancel', () => {
    const onTargetRectChange = vi.fn();
    const root = createRoot(container);
    const targetRect: Rect = { x: 40, y: 30, width: 80, height: 60 };

    act(() => {
      root.render(
        <EditorCanvas
          frame={frame}
          targetRect={targetRect}
          onTargetRectChange={onTargetRectChange}
        />,
      );
    });

    const canvas = container.querySelector('canvas');
    expect(canvas).not.toBeNull();

    Object.defineProperty(canvas!, 'getBoundingClientRect', {
      value: () => ({
        left: 0,
        top: 0,
        width: 200,
        height: 150,
        right: 200,
        bottom: 150,
      }),
    });

    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.defineProperty(canvas!, 'setPointerCapture', {
      value: setPointerCapture,
    });
    Object.defineProperty(canvas!, 'releasePointerCapture', {
      value: releasePointerCapture,
    });
    Object.defineProperty(canvas!, 'hasPointerCapture', {
      value: vi.fn(() => true),
    });

    act(() => {
      dispatchPointer(canvas!, 'pointerdown', 80, 60);
    });

    act(() => {
      dispatchPointer(canvas!, 'pointercancel', 80, 60);
    });

    expect(setPointerCapture).toHaveBeenCalledWith(1);
    expect(releasePointerCapture).toHaveBeenCalledWith(1);
    expect(onTargetRectChange).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
  });
});
