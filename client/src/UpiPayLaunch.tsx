import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { UpiAppPicker } from './UpiAppPicker';
import { useT } from './i18n';
import { buildUpiPayUri } from './upiPay';

/** Public page: WhatsApp https link → choose a UPI app without WhatsApp Pay intercepting. */
export function UpiPayLaunch() {
  const t = useT();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const [uri, setUri] = useState('');
  const token = String(params.get('t') ?? '').trim();
  const pa = params.get('pa') ?? '';
  const am = params.get('am') ?? '';
  const pn = params.get('pn') ?? 'SwimIT';
  const tn = params.get('tn') ?? '';

  useEffect(() => {
    let cancelled = false;

    async function launch(next: string) {
      if (!next) {
        setError('Payment link is incomplete.');
        return;
      }
      setUri(next);
    }

    async function run() {
      if (token) {
        try {
          const res = await fetch(`/api/open/upi-pay/${encodeURIComponent(token)}`);
          const body = (await res.json().catch(() => ({}))) as {
            error?: string;
            pa?: string;
            am?: number;
            pn?: string;
            tn?: string;
          };
          if (!res.ok) {
            if (!cancelled) setError(body.error || 'This payment link is not valid anymore.');
            return;
          }
          const next = buildUpiPayUri(
            String(body.pa ?? ''),
            Number(body.am),
            String(body.tn ?? ''),
            String(body.pn ?? 'SwimIT'),
          );
          if (!cancelled) await launch(next);
        } catch {
          if (!cancelled) setError('Failed to open payment link');
        }
        return;
      }

      const next = buildUpiPayUri(pa, Number(am), tn, pn);
      if (!cancelled) await launch(next);
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [token, pa, am, pn, tn]);

  return (
    <div className="route-fallback upi-pay-launch">
      {error ? (
        <p className="error">{t(error)}</p>
      ) : (
        <>
          <p className="muted">
            {t('In the app, start a new payment, paste the UPI ID, enter this amount, and pay.')}
          </p>
          {uri ? <UpiAppPicker uri={uri} variant="page" /> : <p className="muted">{t('Opening UPI app…')}</p>}
        </>
      )}
    </div>
  );
}
