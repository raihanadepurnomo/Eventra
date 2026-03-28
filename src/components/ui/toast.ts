import toastLib from 'react-hot-toast';

// re-export react-hot-toast as a drop-in replacement for @blinkdotnew/ui toast
export const toast = Object.assign(
  (message: string) => toastLib(message),
  {
    success: (message: string) => toastLib.success(message),
    error: (message: string) => toastLib.error(message),
  }
);
