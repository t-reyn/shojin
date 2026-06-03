import { create } from "zustand";

interface ConfirmReq {
  kind: "confirm";
  id: number;
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  danger: boolean;
  resolve: (value: boolean) => void;
}

interface PromptReq {
  kind: "prompt";
  id: number;
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue: string;
  confirmLabel: string;
  resolve: (value: string | null) => void;
}

type DialogReq = ConfirmReq | PromptReq;

interface DialogState {
  active: DialogReq | null;
  set: (req: DialogReq | null) => void;
}

const useDialog = create<DialogState>((set) => ({
  active: null,
  set: (req) => set({ active: req }),
}));

export { useDialog };

let dialogCounter = 0;

export function confirmDialog(opts: {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}): Promise<boolean> {
  return new Promise((resolve) => {
    dialogCounter += 1;
    useDialog.getState().set({
      kind: "confirm",
      id: dialogCounter,
      title: opts.title,
      message: opts.message,
      confirmLabel: opts.confirmLabel ?? "Confirm",
      cancelLabel: opts.cancelLabel ?? "Cancel",
      danger: opts.danger ?? false,
      resolve,
    });
  });
}

export function promptDialog(opts: {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
}): Promise<string | null> {
  return new Promise((resolve) => {
    dialogCounter += 1;
    useDialog.getState().set({
      kind: "prompt",
      id: dialogCounter,
      title: opts.title,
      message: opts.message,
      placeholder: opts.placeholder,
      defaultValue: opts.defaultValue ?? "",
      confirmLabel: opts.confirmLabel ?? "Save",
      resolve,
    });
  });
}
