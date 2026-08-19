import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useT } from './i18n';
import { buildUpiPayUri, openUpiPay } from './upiPay';

/** Public page: WhatsApp https link → open UPI intent without encoding @ as %40. */
export function UpiPayLaunch() {
  const t = useT();
  const [params] = useSearchParams();
  const [error, setError] = useState('');
  const uri = useMemo(() => {
    const pa = params.get('pa') ?? '';
    const am = Number(params.get('am') ?? '');
    const pn = params.get('pn') ?? 'SwimIT';
    const tn = params.get('tn') ?? '';
    return buildUpiPayUri(pa, am, tn, pn);
  }, [params]);

  useEffect(() => {
    if (!uri) {
      setError('Payment link is incomplete.');
      return;
    }
    openUpiPay(uri);
  }, [uri]);

  return (
    <div className="route-fallback upi-pay-launch">
      {error ? (
        <p className="error">{t(error)}</p>
      ) : (
        <>
          <p className="muted">{t('Opening UPI app…')}</p>
          <button type="button" className="submit" onClick={() => openUpiPay(uri)}>
            {t('Open UPI payment app')}
          </button>
        </>
      )}
    </div>
  );
}
