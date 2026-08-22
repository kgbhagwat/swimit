import { useEffect, useState } from 'react';
import { FilePreview } from './FilePreview';
import { useT } from './i18n';
import {
  fetchSwimmerInvoices,
  formatInvoiceInr,
  type PassInvoice,
  type SwimmerInvoicePack,
} from './passInvoice';
import { formatDisplayDate } from './swimmerPass';

export function PassInvoiceBody({ swimmerId }: { swimmerId: number }) {
  const t = useT();
  const [pack, setPack] = useState<SwimmerInvoicePack | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    setPack(null);
    void fetchSwimmerInvoices(swimmerId)
      .then((next) => {
        if (cancelled) return;
        setPack(next);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : t('Failed to load invoices'));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [swimmerId]);

  if (loading) return <p className="pass-empty">{t('Loading…')}</p>;
  if (error) return <p className="error">{error}</p>;
  if (!pack) return null;
  if (!pack.invoice) return <p className="pass-empty">{t('No invoices yet for this swimmer.')}</p>;

  return (
    <div className="pass-popup-invoice-body">
      <PassInvoiceDocument invoice={pack.invoice} pool={pack.pool} />
    </div>
  );
}

function PassInvoiceDocument({
  invoice,
  pool,
}: {
  invoice: PassInvoice;
  pool: SwimmerInvoicePack['pool'];
}) {
  const t = useT();
  const poolName = invoice.poolName || pool.poolName || 'SwimIT';
  const poolAddress = invoice.poolAddress || pool.poolAddress || '';
  const logoUrl = invoice.poolLogoUrl || pool.poolLogoUrl;
  const lineAmount = invoice.amount;

  return (
    <article className="pass-invoice-doc" aria-label={`${t('Tax Invoice')} ${invoice.invoiceNumber}`}>
      <header className="pass-invoice-header">
        <div className="pass-invoice-brand">
          <div className="pass-invoice-logo-wrap" aria-hidden={!logoUrl}>
            {logoUrl ? (
              <FilePreview src={logoUrl} alt={poolName} className="pass-invoice-logo" draggable={false} />
            ) : (
              <span className="pass-invoice-logo-fallback">{poolName.slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div>
            <p className="pass-invoice-pool">{poolName}</p>
            {poolAddress ? <p className="pass-invoice-address">{poolAddress}</p> : null}
          </div>
        </div>
        <div className="pass-invoice-title-block">
          <h3>{t('Tax Invoice')}</h3>
          <p className="pass-invoice-incl">{t('Inclusive of all taxes')}</p>
        </div>
      </header>

      <dl className="pass-invoice-meta">
        <div>
          <dt>{t('Invoice number')}</dt>
          <dd>{invoice.invoiceNumber}</dd>
        </div>
        <div>
          <dt>{t('Invoice date')}</dt>
          <dd>{formatDisplayDate(invoice.paymentDate)}</dd>
        </div>
        <div>
          <dt>{t('Payment date')}</dt>
          <dd>{formatDisplayDate(invoice.paymentDate)}</dd>
        </div>
        <div>
          <dt>{t('Mode')}</dt>
          <dd>{invoice.paymentMode || '—'}</dd>
        </div>
        {invoice.transactionId ? (
          <div>
            <dt>{t('Transaction ID')}</dt>
            <dd>{invoice.transactionId}</dd>
          </div>
        ) : null}
      </dl>

      <section className="pass-invoice-billto" aria-label={t('Bill to')}>
        <h4>{t('Bill to')}</h4>
        <p>
          <strong>{invoice.swimmerName}</strong>
        </p>
        {invoice.swimmerContact ? <p>{invoice.swimmerContact}</p> : null}
        {invoice.swimmerEmail ? <p>{invoice.swimmerEmail}</p> : null}
        {invoice.swimmerAddress ? <p>{invoice.swimmerAddress}</p> : null}
      </section>

      <table className="pass-invoice-table">
        <thead>
          <tr>
            <th>{t('Particulars')}</th>
            <th className="pass-invoice-num">{t('Amount')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>
              {invoice.passType || t('Pass')}
              {invoice.passDuration ? ` · ${invoice.passDuration}` : ''}
              <span className="pass-invoice-line-note">{t('Pass charges')}</span>
            </td>
            <td className="pass-invoice-num">{formatInvoiceInr(lineAmount)}</td>
          </tr>
        </tbody>
      </table>

      <dl className="pass-invoice-totals">
        <div className="pass-invoice-grand">
          <dt>{t('Total')}</dt>
          <dd>{formatInvoiceInr(invoice.amount)}</dd>
        </div>
      </dl>
      <p className="pass-invoice-footnote">{t('Inclusive of all taxes')}</p>
    </article>
  );
}
