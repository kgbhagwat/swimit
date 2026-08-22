export type PassPopupKind = 'qr' | 'pass' | 'invoice';

export type PassPopupRequest = {
  kind: PassPopupKind;
  id: number;
};

export const PASS_POPUP_EVENT = 'swimIT:pass-popup';

export function requestPassPopup(kind: PassPopupKind, id: number) {
  window.dispatchEvent(
    new CustomEvent<PassPopupRequest>(PASS_POPUP_EVENT, { detail: { kind, id } }),
  );
}
