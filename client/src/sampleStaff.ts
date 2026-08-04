/** Sample staff used in Application (no-account) preview. */

export type SampleBatchSlot = {
  id: string;
  name: string;
  type: string;
  startTime: string;
  endTime: string;
};

export type SampleStaffDetail = {
  id: number;
  registrationFor: 'Coach' | 'Lifeguard' | 'Other';
  fullName: string;
  fullAddress: string;
  whatsappMobile: string;
  otherMobile: string;
  email: string;
  birthdate: string;
  sex: string;
  bloodGroup: string;
  emergencyName: string;
  emergencyRelation: string;
  emergencyMobile: string;
  hasHealthIssue: string;
  healthIssueDetails: string;
  doctorName: string;
  doctorNo: string;
  identityDocument: string;
  teachStrokes: string[];
  suitableBatchIds: string[];
  achievements: string;
  hasLifeguardCert: string;
  lifeguardExpiry: string;
  certificateDetails: string;
  postName: string;
  salary: string;
  isActive: boolean;
};

export const SAMPLE_STAFF_BATCHES: SampleBatchSlot[] = [
  {
    id: 'sample-morning-a',
    name: 'Morning A',
    type: 'Mixed',
    startTime: '06:00',
    endTime: '07:00',
  },
  {
    id: 'sample-morning-b',
    name: 'Morning B',
    type: 'Mixed',
    startTime: '07:00',
    endTime: '08:00',
  },
  {
    id: 'sample-morning-c',
    name: 'Morning C',
    type: 'Kids',
    startTime: '08:00',
    endTime: '09:00',
  },
  {
    id: 'sample-morning-d',
    name: 'Morning D',
    type: 'Ladies',
    startTime: '09:00',
    endTime: '10:00',
  },
  {
    id: 'sample-afternoon-a',
    name: 'Afternoon A',
    type: 'Mixed',
    startTime: '16:00',
    endTime: '17:00',
  },
  {
    id: 'sample-afternoon-b',
    name: 'Afternoon B',
    type: 'Advance',
    startTime: '17:00',
    endTime: '18:00',
  },
  {
    id: 'sample-evening-b',
    name: 'Evening B',
    type: 'Mixed',
    startTime: '18:00',
    endTime: '19:00',
  },
  {
    id: 'sample-evening-c',
    name: 'Evening C',
    type: 'Mixed',
    startTime: '19:00',
    endTime: '20:00',
  },
];

function formatBatchLabel(slot: SampleBatchSlot) {
  return `${slot.name} — ${slot.type} — ${slot.startTime} to ${slot.endTime}`;
}

export const SAMPLE_STAFF_DETAILS: SampleStaffDetail[] = [
  {
    id: -1,
    registrationFor: 'Coach',
    fullName: 'Riya Kulkarni',
    fullAddress: '12 Lake View, Pune',
    whatsappMobile: '9876501234',
    otherMobile: '',
    email: 'riya@example.com',
    birthdate: '1992-04-12',
    sex: 'Female',
    bloodGroup: 'B+',
    emergencyName: 'Anil Kulkarni',
    emergencyRelation: 'Father',
    emergencyMobile: '9876500001',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'AADHAAR-SAMPLE-1',
    teachStrokes: ['Free Style', 'Back Stroke'],
    suitableBatchIds: ['sample-morning-a'],
    achievements: 'State-level freestyle finalist',
    hasLifeguardCert: 'Yes',
    lifeguardExpiry: '2027-12-31',
    certificateDetails: 'Level 2 coaching certificate',
    postName: '',
    salary: '',
    isActive: true,
  },
  {
    id: -2,
    registrationFor: 'Coach',
    fullName: 'Amit Sharma',
    fullAddress: '88 River Road, Nashik',
    whatsappMobile: '9876505678',
    otherMobile: '',
    email: 'amit@example.com',
    birthdate: '1988-09-03',
    sex: 'Male',
    bloodGroup: 'O+',
    emergencyName: 'Priya Sharma',
    emergencyRelation: 'Spouse',
    emergencyMobile: '9876500002',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'AADHAAR-SAMPLE-2',
    teachStrokes: ['Breast Stroke', 'Butterfly'],
    suitableBatchIds: ['sample-evening-b'],
    achievements: '',
    hasLifeguardCert: 'No',
    lifeguardExpiry: '',
    certificateDetails: '',
    postName: '',
    salary: '',
    isActive: true,
  },
  {
    id: -3,
    registrationFor: 'Coach',
    fullName: 'Neha Deshmukh',
    fullAddress: '5 Hill Crest, Mumbai',
    whatsappMobile: '9876509012',
    otherMobile: '',
    email: 'neha@example.com',
    birthdate: '1995-01-21',
    sex: 'Female',
    bloodGroup: 'A+',
    emergencyName: 'Ravi Deshmukh',
    emergencyRelation: 'Brother',
    emergencyMobile: '9876500003',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'AADHAAR-SAMPLE-3',
    teachStrokes: ['Free Style'],
    suitableBatchIds: ['sample-morning-a', 'sample-evening-b'],
    achievements: '',
    hasLifeguardCert: 'Yes',
    lifeguardExpiry: '2026-06-30',
    certificateDetails: '',
    postName: '',
    salary: '',
    isActive: false,
  },
  {
    id: -11,
    registrationFor: 'Lifeguard',
    fullName: 'Sana Joshi',
    fullAddress: '21 Palm Street, Pune',
    whatsappMobile: '9123456780',
    otherMobile: '',
    email: 'sana@example.com',
    birthdate: '1994-07-18',
    sex: 'Female',
    bloodGroup: 'B+',
    emergencyName: 'Meera Joshi',
    emergencyRelation: 'Mother',
    emergencyMobile: '9123456700',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'AADHAAR-SAMPLE-11',
    teachStrokes: [],
    suitableBatchIds: [],
    achievements: '',
    hasLifeguardCert: 'Yes',
    lifeguardExpiry: '2027-03-31',
    certificateDetails: '',
    postName: 'Lifeguard',
    salary: '',
    isActive: true,
  },
  {
    id: -12,
    registrationFor: 'Lifeguard',
    fullName: 'Kabir Shah',
    fullAddress: '9 Oak Lane, Pune',
    whatsappMobile: '9123456781',
    otherMobile: '',
    email: 'kabir@example.com',
    birthdate: '1991-11-02',
    sex: 'Male',
    bloodGroup: 'AB+',
    emergencyName: 'Imran Shah',
    emergencyRelation: 'Father',
    emergencyMobile: '9123456701',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'AADHAAR-SAMPLE-12',
    teachStrokes: [],
    suitableBatchIds: [],
    achievements: '',
    hasLifeguardCert: 'Yes',
    lifeguardExpiry: '2026-11-30',
    certificateDetails: '',
    postName: 'Lifeguard',
    salary: '',
    isActive: true,
  },
  {
    id: -21,
    registrationFor: 'Other',
    fullName: 'Meera Iyer',
    fullAddress: '44 Desk Road, Pune',
    whatsappMobile: '9000011122',
    otherMobile: '',
    email: 'meera@example.com',
    birthdate: '1990-05-09',
    sex: 'Female',
    bloodGroup: 'O+',
    emergencyName: 'Arjun Iyer',
    emergencyRelation: 'Spouse',
    emergencyMobile: '9000011100',
    hasHealthIssue: 'No',
    healthIssueDetails: '',
    doctorName: '',
    doctorNo: '',
    identityDocument: 'AADHAAR-SAMPLE-21',
    teachStrokes: [],
    suitableBatchIds: [],
    achievements: '',
    hasLifeguardCert: 'No',
    lifeguardExpiry: '',
    certificateDetails: '',
    postName: 'Front desk',
    salary: '18000',
    isActive: true,
  },
];

const batchLabelById = new Map(
  SAMPLE_STAFF_BATCHES.map((slot) => [slot.id, formatBatchLabel(slot)]),
);

export function getSampleStaffDetail(id: number) {
  return SAMPLE_STAFF_DETAILS.find((row) => row.id === id) ?? null;
}

export function sampleCoachListRows() {
  return SAMPLE_STAFF_DETAILS.filter((row) => row.registrationFor === 'Coach').map((row) => ({
    id: row.id,
    fullName: row.fullName,
    contact: row.whatsappMobile,
    email: row.email,
    batches: row.suitableBatchIds
      .map((batchId) => batchLabelById.get(batchId))
      .filter((label): label is string => Boolean(label)),
    teachStrokes: row.teachStrokes.length > 0 ? row.teachStrokes.join(', ') : '—',
    isActive: row.isActive,
  }));
}

export function sampleSimpleStaffRows(role: 'Lifeguard' | 'Other') {
  return SAMPLE_STAFF_DETAILS.filter((row) => row.registrationFor === role).map((row) => ({
    id: row.id,
    fullName: row.fullName,
    contact: row.whatsappMobile,
    email: row.email,
    post: row.postName || row.registrationFor,
  }));
}
