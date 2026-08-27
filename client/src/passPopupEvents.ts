export type PassPopupKind = 'qr' | 'pass' | 'invoice';

export type PassPopupCard = {
  id: number;
  fullName: string;
  photoUrl: string | null;
  passType: string;
  duration: string;
  batch: string;
  coach: string;
  passValidUntil: string;
};

export type PassPopupRequest = {
  kind: PassPopupKind;
  id: number;
  showOk?: boolean;
  card?: PassPopupCard;
};

export const PASS_POPUP_EVENT = 'swimIT:pass-popup';

export function requestPassPopup(
  kind: PassPopupKind,
  id: number,
  options?: { showOk?: boolean; card?: PassPopupCard },
) {
  window.dispatchEvent(
    new CustomEvent<PassPopupRequest>(PASS_POPUP_EVENT, {
      detail: { kind, id, showOk: options?.showOk, card: options?.card },
    }),
  );
}
