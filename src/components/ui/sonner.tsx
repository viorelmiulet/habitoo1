import { Toaster as Sonner, toast as sonnerToast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

/**
 * Notificările de succes dispar repede (confirmările nu trebuie citite mult),
 * iar toate notificările au buton de închidere (X) — vezi `closeButton` pe
 * Toaster. Erorile păstrează durata implicită (mai lungă), ca să poată fi citite.
 */
const SUCCESS_TOAST_DURATION_MS = 2500;

type SonnerToast = typeof sonnerToast;
type SuccessOptions = Parameters<SonnerToast["success"]>[1];

const toast: SonnerToast = Object.assign(
  ((...args: Parameters<SonnerToast>) => sonnerToast(...args)) as SonnerToast,
  sonnerToast,
  {
    success: ((
      message: Parameters<SonnerToast["success"]>[0],
      options?: SuccessOptions,
    ) =>
      sonnerToast.success(message, {
        duration: SUCCESS_TOAST_DURATION_MS,
        ...options,
      })) as SonnerToast["success"],
  },
);

const Toaster = ({ ...props }: ToasterProps) => {
  return (
    <Sonner
      className="toaster group"
      closeButton
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          closeButton:
            "group-[.toast]:bg-background group-[.toast]:text-muted-foreground group-[.toast]:border-border",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
