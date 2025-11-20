import { ReactNode } from "react";

type ModalProps = {
  title: string;
  description?: string;
  onClose: () => void;
  actions: ReactNode;
  children: ReactNode;
};

export function Modal({ title, description, onClose, actions, children }: ModalProps) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur">
      <div className="relative w-[480px] max-w-[92vw] rounded-xl border border-slate-200/10 bg-[#0b1224] p-6">
        <div className="mb-4 space-y-1">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-50">{title}</h2>
              {description && <p className="text-sm text-slate-300/80">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded border border-slate-200/20 px-2 py-1 text-xs font-semibold text-slate-200 transition hover:border-slate-100/30 hover:bg-slate-800/60"
            >
              Close
            </button>
          </div>
        </div>
        <div className="space-y-4">{children}</div>
        <div className="mt-6 flex items-center justify-end gap-3">{actions}</div>
      </div>
    </div>
  );
}

