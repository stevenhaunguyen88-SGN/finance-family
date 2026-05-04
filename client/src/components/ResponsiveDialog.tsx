import * as React from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  children: React.ReactNode;
  /** Footer rendered inside the dialog/sheet. */
  footer?: React.ReactNode;
  /** Max width on desktop only (sm:max-w-md by default). */
  desktopWidthClassName?: string;
}

/**
 * Renders a centered Dialog on desktop and a bottom Sheet on mobile so forms
 * are reachable with a thumb. Both share the same children.
 */
export function ResponsiveDialog({
  open,
  onOpenChange,
  title,
  children,
  footer,
  desktopWidthClassName = "sm:max-w-md",
}: ResponsiveDialogProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="rounded-t-2xl px-4 pb-[env(safe-area-inset-bottom)] pt-5 max-h-[92vh] overflow-y-auto"
        >
          <SheetHeader className="text-left mb-3">
            <SheetTitle>{title}</SheetTitle>
          </SheetHeader>
          {children}
          {footer && <SheetFooter className="mt-4 sm:mt-4">{footer}</SheetFooter>}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn(desktopWidthClassName)}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
