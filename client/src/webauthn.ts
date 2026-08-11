import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/browser';
import {
  captureLoginLocation,
  parseRemoteAccessRequired,
  RemoteAccessRequiredError,
} from './loginLocation';

export type BiometricDevicePref = {
  credentialId: string;
  userName: string;
  enabled: boolean;
};

function prefKey(accountCode: string) {
  return `swimIT.webauthn.${accountCode.toLowerCase()}`;
}

export function readBiometricPref(accountCode: string): BiometricDevicePref | null {
  try {
    const raw = localStorage.getItem(prefKey(accountCode));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BiometricDevicePref;
    if (!parsed?.credentialId || !parsed?.userName) return null;
    return {
      credentialId: String(parsed.credentialId),
      userName: String(parsed.userName),
      enabled: parsed.enabled !== false,
    };
  } catch {
    return null;
  }
}

export function writeBiometricPref(accountCode: string, pref: BiometricDevicePref) {
  localStorage.setItem(prefKey(accountCode), JSON.stringify(pref));
}

export function clearBiometricPref(accountCode: string) {
  localStorage.removeItem(prefKey(accountCode));
}

/** True on phones/tablets where biometric unlock is the main ask. */
export function isMobileLikeDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return true;
  return typeof navigator.maxTouchPoints === 'number' && navigator.maxTouchPoints > 1;
}

export async function canUseBiometricLogin() {
  if (typeof window === 'undefined') return false;
  if (!window.isSecureContext && location.hostname !== 'localhost') return false;
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function enrollBiometricLogin(opts: {
  accountCode: string;
  userId: number;
  deviceLabel?: string;
}): Promise<BiometricDevicePref> {
  const optionsRes = await fetch(
    `/api/saas-accounts/by-code/${encodeURIComponent(opts.accountCode)}/webauthn/register/options`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: opts.userId }),
    },
  );
  const optionsBody = await optionsRes.json().catch(() => ({}));
  if (!optionsRes.ok) {
    throw new Error(optionsBody.error ?? 'Failed to start biometric enrollment');
  }

  let attestation: RegistrationResponseJSON;
  try {
    attestation = await startRegistration({
      optionsJSON: optionsBody as PublicKeyCredentialCreationOptionsJSON,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError') {
      throw new Error('Biometric enrollment was cancelled');
    }
    throw new Error(err instanceof Error ? err.message : 'Biometric enrollment failed');
  }

  const verifyRes = await fetch(
    `/api/saas-accounts/by-code/${encodeURIComponent(opts.accountCode)}/webauthn/register/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: opts.userId,
        response: attestation,
        deviceLabel: opts.deviceLabel || (isMobileLikeDevice() ? 'Mobile device' : 'This device'),
      }),
    },
  );
  const verifyBody = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    throw new Error(verifyBody.error ?? 'Failed to save biometric login');
  }

  const pref: BiometricDevicePref = {
    credentialId: String(verifyBody.credentialId ?? attestation.id),
    userName: String(verifyBody.userName ?? ''),
    enabled: true,
  };
  writeBiometricPref(opts.accountCode, pref);
  return pref;
}

export async function loginWithBiometric(opts: {
  accountCode: string;
  userName?: string;
  credentialId?: string;
}): Promise<{
  user: {
    id: number;
    userName: string;
    mobile: string;
    mustChangePassword: boolean;
    isAccountAdmin: boolean;
    menuAccess: string[];
  };
  credentialId: string;
}> {
  const optionsRes = await fetch(
    `/api/saas-accounts/by-code/${encodeURIComponent(opts.accountCode)}/webauthn/login/options`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userName: opts.userName || undefined,
        credentialId: opts.credentialId || undefined,
      }),
    },
  );
  const optionsBody = await optionsRes.json().catch(() => ({}));
  if (!optionsRes.ok) {
    throw new Error(optionsBody.error ?? 'Failed to start biometric login');
  }

  let assertion: AuthenticationResponseJSON;
  try {
    assertion = await startAuthentication({
      optionsJSON: optionsBody as PublicKeyCredentialRequestOptionsJSON,
    });
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    if (name === 'NotAllowedError') {
      throw new Error('Biometric login was cancelled');
    }
    throw new Error(err instanceof Error ? err.message : 'Biometric login failed');
  }

  const geo = await captureLoginLocation();
  const verifyRes = await fetch(
    `/api/saas-accounts/by-code/${encodeURIComponent(opts.accountCode)}/webauthn/login/verify`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        response: assertion,
        latitude: geo?.latitude ?? null,
        longitude: geo?.longitude ?? null,
        accuracyM: geo?.accuracyM ?? null,
      }),
    },
  );
  const verifyBody = await verifyRes.json().catch(() => ({}));
  if (!verifyRes.ok) {
    const pending = parseRemoteAccessRequired(verifyBody as Record<string, unknown>);
    if (pending) throw new RemoteAccessRequiredError(pending);
    throw new Error(verifyBody.error ?? 'Biometric login failed');
  }

  const credentialId = String(verifyBody.credentialId ?? assertion.id);
  const userName = String(verifyBody.user?.userName ?? opts.userName ?? '');
  if (credentialId && userName) {
    writeBiometricPref(opts.accountCode, {
      credentialId,
      userName,
      enabled: true,
    });
  }

  return {
    user: {
      id: Number(verifyBody.user.id),
      userName: String(verifyBody.user.userName),
      mobile: String(verifyBody.user.mobile ?? ''),
      mustChangePassword: Boolean(verifyBody.user.mustChangePassword),
      isAccountAdmin: Boolean(verifyBody.user.isAccountAdmin),
      menuAccess: Array.isArray(verifyBody.user.menuAccess)
        ? verifyBody.user.menuAccess.map(String)
        : [],
    },
    credentialId,
  };
}

export async function removeBiometricCredential(opts: {
  accountCode: string;
  userId: number;
  credentialId: string;
}) {
  const res = await fetch(
    `/api/saas-accounts/by-code/${encodeURIComponent(opts.accountCode)}/webauthn/credentials/${encodeURIComponent(opts.credentialId)}?userId=${opts.userId}`,
    { method: 'DELETE' },
  );
  if (!res.ok && res.status !== 204) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? 'Failed to remove biometric login');
  }
  const pref = readBiometricPref(opts.accountCode);
  if (pref?.credentialId === opts.credentialId) {
    clearBiometricPref(opts.accountCode);
  }
}
