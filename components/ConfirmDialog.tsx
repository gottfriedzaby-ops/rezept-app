"use client";

interface Props {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Bestätigen",
  destructive = false,
  onConfirm,
  onCancel,
}: Props) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-[2px]"
        onClick={onCancel}
      />
      <div className="relative bg-white rounded-lg shadow-lg border border-stone p-6 max-w-sm w-full mx-4">
        <h2 className="font-serif text-lg font-medium text-ink-primary mb-2">{title}</h2>
        <p className="text-sm text-ink-secondary mb-6">{message}</p>
        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="btn-ghost flex-1">
            Abbrechen
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 px-4 py-2.5 text-sm font-medium rounded transition-colors ${
              destructive
                ? "bg-red-600 hover:bg-red-700 text-white"
                : "btn-primary"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
