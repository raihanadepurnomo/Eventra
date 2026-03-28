import toastLib from 'react-hot-toast';
import { createElement } from 'react';

interface ActionToastOptions {
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm?: () => void;
  onCancel?: () => void;
  duration?: number;
}

function actionToast({
  message,
  confirmLabel = 'Lanjut',
  cancelLabel = 'Nanti',
  onConfirm,
  onCancel,
  duration = 7000,
}: ActionToastOptions) {
  return toastLib.custom(
    (t) => {
      const closeToast = () => {
        toastLib.dismiss(t.id);
        window.setTimeout(() => toastLib.remove(t.id), 140);
      };

      return createElement(
        'div',
        {
          className: [
            'max-w-sm rounded-xl border border-border/80 bg-card/95 text-card-foreground p-3.5 shadow-lg backdrop-blur-sm',
            'transition-all duration-200 ease-out will-change-transform',
            t.visible
              ? 'opacity-100 translate-y-0 scale-100'
              : 'opacity-0 translate-y-2 scale-95 pointer-events-none',
          ].join(' '),
        },
        createElement('p', { className: 'text-sm leading-relaxed mb-3' }, message),
        createElement(
          'div',
          { className: 'flex items-center justify-end gap-2' },
          createElement(
            'button',
            {
              className:
                'px-2.5 py-1.5 text-xs rounded-md border border-border hover:bg-muted transition-colors active:scale-[0.98]',
              onClick: () => {
                closeToast();
                onCancel?.();
              },
            },
            cancelLabel
          ),
          createElement(
            'button',
            {
              className:
                'px-2.5 py-1.5 text-xs rounded-md bg-accent text-accent-foreground hover:bg-accent/90 transition-colors active:scale-[0.98]',
              onClick: () => {
                closeToast();
                onConfirm?.();
              },
            },
            confirmLabel
          )
        )
      );
    },
    { duration, removeDelay: 140 }
  );
}

// re-export react-hot-toast as a drop-in replacement for @blinkdotnew/ui toast
export const toast = Object.assign(
  (message: string) => toastLib(message),
  {
    success: (message: string) => toastLib.success(message),
    error: (message: string) => toastLib.error(message),
    action: actionToast,
  }
);
