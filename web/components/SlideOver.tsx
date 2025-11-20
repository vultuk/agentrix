import { ReactNode } from "react";

type Props = {
  title: string;
  onClose: () => void;
  children: ReactNode;
};

export function SlideOver({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative h-full w-full max-w-[33vw] min-w-[320px] bg-[#0b0b0d] rounded-l-[24px] shadow-[-24px_0_48px_-28px_rgba(0,0,0,0.8)]">
        <div className="flex items-start justify-between border-b border-white/10 p-4">
          <div>
            <p className="text-sm font-semibold text-white">{title}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-zinc-400 hover:text-white"
            aria-label="Close details"
          >
            Close
          </button>
        </div>
        <div className="h-[calc(100%-57px)] overflow-y-auto p-4 text-sm text-zinc-200">{children}</div>
      </div>
    </div>
  );
}
