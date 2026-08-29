import { isApplicationDemo } from './applicationDemo';
import { indiaDaysAgoIso, indiaTodayIso } from './indiaDate';

export type PassInvoice = {
  id: number;
  invoiceNumber: string;
  paymentDate: string;
  swimmerName: string;
  swimmerContact: string;
  swimmerEmail: string;
  swimmerAddress: string;
  passType: string;
  passDuration: string;
  passCharges: number;
  coachingCharges: number;
  taxableAmount: number;
  gstPercent: number;
  gstAmount: number;
  amount: number;
  taxInclusive: boolean;
  paymentMode: string;
  transactionId: string;
  poolName: string;
  poolAddress: string;
  poolLogoUrl: string | null;
};

export type SwimmerInvoicePack = {
  swimmer: {
    id: number;
    fullName: string;
    contact: string;
    email: string;
    address: string;
  };
  pool: {
    poolName: string;
    poolAddress: string;
    poolLogoUrl: string | null;
  };
  invoice: PassInvoice | null;
};

const SAMPLE_POOL = {
  poolName: 'SwimIT Sample Pool',
  poolAddress: '12 Sample Lane, Pune',
  poolLogoUrl: null as string | null,
};

function money(n: number) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function inclusiveTax(total: number, percent = 18) {
  const amount = money(Math.max(0, total));
  const taxableAmount = amount <= 0 ? 0 : money(amount / (1 + percent / 100));
  return {
    amount,
    gstPercent: percent,
    taxableAmount,
    gstAmount: money(amount - taxableAmount),
    taxInclusive: true as const,
  };
}

type SampleSwimmer = {
  id: number;
  fullName: string;
  contact: string;
  email: string;
  address: string;
};

const SAMPLE_SWIMMERS: Record<number, SampleSwimmer> = {
  [-101]: {
    id: -101,
    fullName: 'Aarav Patil',
    contact: '9876543210',
    email: 'aarav@example.com',
    address: '12 Sample Lane, Pune',
  },
  [-102]: {
    id: -102,
    fullName: 'Sana Joshi',
    contact: '9123456780',
    email: 'sana@example.com',
    address: '44 Lake View, Pune',
  },
  [-103]: {
    id: -103,
    fullName: 'Vihaan Kulkarni',
    contact: '9988776655',
    email: 'vihaan@example.com',
    address: '8 River Road, Pune',
  },
  [-104]: {
    id: -104,
    fullName: 'Neha Deshmukh',
    contact: '9090909090',
    email: 'neha@example.com',
    address: '21 Hill Street, Pune',
  },
  [-105]: {
    id: -105,
    fullName: 'Rohan Mehta',
    contact: '9012345678',
    email: 'rohan@example.com',
    address: '5 Poolside, Pune',
  },
  [-106]: {
    id: -106,
    fullName: 'Isha Nair',
    contact: '9090909091',
    email: 'isha@example.com',
    address: '19 Garden Lane, Pune',
  },
  [-107]: {
    id: -107,
    fullName: 'Kabir Shah',
    contact: '9123456781',
    email: 'kabir@example.com',
    address: '3 East Gate, Pune',
  },
};

function sampleInvoice(params: {
  id: number;
  swimmer: SampleSwimmer;
  passType: string;
  passDuration: string;
  passCharges: number;
  coachingCharges: number;
  paymentDate: string;
  paymentMode: string;
  transactionId?: string;
}): PassInvoice {
  const tax = inclusiveTax(params.passCharges);
  return {
    id: params.id,
    invoiceNumber: `INV-${params.paymentDate.slice(0, 4)}-${String(Math.abs(params.id)).padStart(6, '0')}`,
    paymentDate: params.paymentDate,
    swimmerName: params.swimmer.fullName,
    swimmerContact: params.swimmer.contact,
    swimmerEmail: params.swimmer.email,
    swimmerAddress: params.swimmer.address,
    passType: params.passType,
    passDuration: params.passDuration,
    passCharges: money(params.passCharges),
    coachingCharges: money(params.coachingCharges),
    ...tax,
    paymentMode: params.paymentMode,
    transactionId: params.transactionId ?? '',
    ...SAMPLE_POOL,
  };
}

const SAMPLE_INVOICES: Record<number, PassInvoice> = {
  [-101]: sampleInvoice({
    id: -9101,
    swimmer: SAMPLE_SWIMMERS[-101],
    passType: 'Monthly Swim',
    passDuration: '1 Month',
    passCharges: 2000,
    coachingCharges: 500,
    paymentDate: indiaTodayIso(),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN101',
  }),
  [-102]: sampleInvoice({
    id: -9201,
    swimmer: SAMPLE_SWIMMERS[-102],
    passType: 'Quarterly Swim',
    passDuration: '3 Months',
    passCharges: 5000,
    coachingCharges: 500,
    paymentDate: indiaDaysAgoIso(10),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN102',
  }),
  [-103]: sampleInvoice({
    id: -9301,
    swimmer: SAMPLE_SWIMMERS[-103],
    passType: 'Monthly Swim',
    passDuration: '1 Month',
    passCharges: 2000,
    coachingCharges: 500,
    paymentDate: indiaDaysAgoIso(15),
    paymentMode: 'Cash',
  }),
  [-104]: sampleInvoice({
    id: -9401,
    swimmer: SAMPLE_SWIMMERS[-104],
    passType: 'Monthly Swim',
    passDuration: '1 Month',
    passCharges: 2000,
    coachingCharges: 500,
    paymentDate: indiaDaysAgoIso(10),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN104',
  }),
  [-105]: sampleInvoice({
    id: -9501,
    swimmer: SAMPLE_SWIMMERS[-105],
    passType: 'Monthly Swim',
    passDuration: '1 Month',
    passCharges: 2000,
    coachingCharges: 500,
    paymentDate: indiaDaysAgoIso(18),
    paymentMode: 'Cash',
  }),
  [-106]: sampleInvoice({
    id: -9601,
    swimmer: SAMPLE_SWIMMERS[-106],
    passType: 'Quarterly Swim',
    passDuration: '3 Months',
    passCharges: 5000,
    coachingCharges: 500,
    paymentDate: indiaDaysAgoIso(45),
    paymentMode: 'Online',
    transactionId: 'SAMPLETXN106',
  }),
  [-107]: sampleInvoice({
    id: -9701,
    swimmer: SAMPLE_SWIMMERS[-107],
    passType: 'Monthly Swim',
    passDuration: '1 Month',
    passCharges: 2000,
    coachingCharges: 0,
    paymentDate: indiaDaysAgoIso(1),
    paymentMode: 'Cash',
  }),
};

export function formatInvoiceInr(value: number) {
  return `₹${money(value).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export async function fetchSwimmerInvoices(id: number): Promise<SwimmerInvoicePack> {
  if (isApplicationDemo() && id < 0) {
    const swimmer = SAMPLE_SWIMMERS[id];
    if (!swimmer) throw new Error('Sample invoices not found');
    return {
      swimmer,
      pool: { ...SAMPLE_POOL },
      invoice: SAMPLE_INVOICES[id] ?? null,
    };
  }
  const res = await fetch(`/api/registrations/${id}/invoices`);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? 'Failed to load invoices');
  return body as SwimmerInvoicePack;
}
