import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Confirm button style — danger (red) by default. */
  danger?: boolean;
  loading?: boolean;
  icon?: ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * App-standard confirmation dialog — the shared HTML modal (never a browser alert). Use it for every
 * destructive action so confirmations look and behave the same everywhere.
 */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  danger = true,
  loading = false,
  icon,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="modal-overlay" onClick={() => !loading && onCancel()}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 440 }}>
        <div className="modal-header">
          <h2>{title}</h2>
          <button className="btn-icon" onClick={onCancel} disabled={loading} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <div className="modal-body">{typeof message === 'string' ? <p style={{ margin: 0 }}>{message}</p> : message}</div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </button>
          <Button variant={danger ? 'danger' : 'primary'} loading={loading} icon={icon} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
