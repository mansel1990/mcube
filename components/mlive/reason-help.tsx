"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

type ReasonHelpProps = {
  text: string;
  label?: string;
  className?: string;
  children?: ReactNode;
};

export function ReasonHelp({ text, label = "Details", className, children }: ReasonHelpProps) {
  const [open, setOpen] = useState(false);
  const [hoverable, setHoverable] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number } | null>(null);
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const fromPointer = useRef(false);
  const restoring = useRef(false);
  const openedByHover = useRef(false);
  const openRef = useRef(false);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    openRef.current = open;
    if (!open) openedByHover.current = false;
  }, [open]);

  useEffect(() => {
    const query = window.matchMedia("(hover: hover) and (pointer: fine)");
    const apply = () => setHoverable(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  function clearTimer() {
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = null;
  }

  function scheduleClose() {
    if (!hoverable) return;
    clearTimer();
    timer.current = window.setTimeout(() => setOpen(false), 160);
  }

  useEffect(() => {
    if (!open) return;
    function place() {
      const trigger = buttonRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 16);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      const popHeight = popRef.current?.offsetHeight ?? 120;
      let top = rect.bottom + 8;
      if (top + popHeight > window.innerHeight - 8) top = Math.max(8, rect.top - popHeight - 8);
      setBox({ top, left, width });
    }
    place();
    function onDoc(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) return;
      if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      restoring.current = true;
      setOpen(false);
      buttonRef.current?.focus();
    }
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, text]);

  useEffect(() => () => clearTimer(), []);

  if (!text) return null;
  const root = typeof document === "undefined" ? null : document.querySelector(".mlive");
  const popover = open && root ? createPortal(
    <div
      ref={popRef}
      id={id}
      role="dialog"
      aria-label={label}
      className="popover"
      style={{ position: "fixed", top: box?.top ?? -9999, left: box?.left ?? 8, width: box?.width ?? 280, zIndex: 80 }}
      onMouseEnter={clearTimer}
      onMouseLeave={scheduleClose}
    >
      {text}
    </div>,
    root,
  ) : null;

  return (
      <span
        className="reason-help"
        onMouseEnter={() => {
          if (!hoverable) return;
          clearTimer();
          if (!openRef.current) openedByHover.current = true;
          openRef.current = true;
          setOpen(true);
        }}
        onMouseLeave={scheduleClose}
      >
      <button
        ref={buttonRef}
        type="button"
        className={className ?? "info-dot"}
        aria-label={children ? undefined : label}
        aria-expanded={open}
        aria-controls={id}
        aria-describedby={open ? id : undefined}
        onPointerDown={() => { fromPointer.current = true; }}
        onClick={() => {
          if (openedByHover.current) {
            openedByHover.current = false;
            openRef.current = true;
            setOpen(true);
            return;
          }
          setOpen((value) => {
            openRef.current = !value;
            return !value;
          });
        }}
        onFocus={() => {
          if (restoring.current) {
            restoring.current = false;
            return;
          }
          if (fromPointer.current) {
            fromPointer.current = false;
            return;
          }
          clearTimer();
          openRef.current = true;
          setOpen(true);
        }}
      >
        {children ?? <span aria-hidden="true">i</span>}
      </button>
      {popover}
    </span>
  );
}

export function ActionPill({ label, text, tone }: { label: string; text: string; tone: string }) {
  const auto = / · auto$/i.test(label);
  const phrase = label.replace(/ · auto$/i, "");
  const sell = tone === "loss" || phrase.toLowerCase().startsWith("sell");
  const face = (
    <span className={`action-face ${sell ? "loss" : "swing"}`}>
      <span aria-hidden="true">{sell ? "↓" : "↑"}</span>
      <span>{phrase}</span>
      {auto ? <span className="suffix">Auto</span> : null}
    </span>
  );
  if (!text) return face;
  return (
    <ReasonHelp text={text} label={phrase} className="action-pill">
      {face}
    </ReasonHelp>
  );
}
