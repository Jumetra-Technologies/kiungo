"use client";

import { useEffect, useRef, useState, type ButtonHTMLAttributes } from "react";
import { X } from "lucide-react";

import { cn } from "./cn";

/**
 * How long the pressed box stays on screen before the dialog closes. Long
 * enough to see on a quick tap, short enough not to feel slow.
 */
export const CLOSE_CONFIRM_MS = 150;

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick" | "children" | "type"> & {
  /** Called once, after the pressed box has shown for CLOSE_CONFIRM_MS. */
  onClose: () => void;
  /** Defaults to "Close". */
  "aria-label"?: string;
};

/**
 * The X in the corner of a dialog. A light gray box on hover; a firmer gray
 * box with an outline when pressed, by mouse, touch or keyboard. The box stays
 * for a moment after the click, then the dialog closes, so the press is seen
 * even on a tap. Escape and a click outside still close at once: they don't
 * go through this button.
 */
export function CloseButton({ onClose, className, "aria-label": label = "Close", ...rest }: Props) {
  const [pressed, setPressed] = useState(false);
  const closing = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const click = () => {
    if (closing.current) return; // a double click closes once
    closing.current = true;
    setPressed(true);
    timer.current = setTimeout(() => {
      timer.current = null;
      closing.current = false;
      setPressed(false);
      onClose();
    }, CLOSE_CONFIRM_MS);
  };

  return (
    <button
      type="button"
      aria-label={label}
      data-pressed={pressed ? "true" : undefined}
      onClick={click}
      onPointerDown={() => setPressed(true)}
      onPointerLeave={() => !closing.current && setPressed(false)}
      onPointerCancel={() => !closing.current && setPressed(false)}
      className={cn("hhip-close-button", className)}
      {...rest}
    >
      <X className="size-4" aria-hidden />
    </button>
  );
}
