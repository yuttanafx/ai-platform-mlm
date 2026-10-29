"use client";

import { useEffect } from "react";

export default function Modal({
  onClose,
  label,
  children,
}: {
  onClose: () => void;
  label: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={label}>
        <button className="modal-close" onClick={onClose} aria-label="ปิด">
          ×
        </button>
        {children}
      </div>
    </div>
  );
}
