export type RegistrationSummary = {
  id: number;
  full_name: string;
  email: string;
  whatsapp_mobile: string;
  birthdate: string;
  sex: string;
  blood_group: string;
  created_at: string;
};

export async function listRegistrations() {
  const res = await fetch('/api/registrations');
  if (!res.ok) throw new Error('Failed to load registrations');
  return res.json() as Promise<RegistrationSummary[]>;
}
