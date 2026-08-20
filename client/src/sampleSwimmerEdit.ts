import type { SwimmerProfile } from './SwimmerProfileReview';

const PREFIX = 'swimIT.sampleSwimmerProfile.';

export function readSampleSwimmerProfile(id: number): SwimmerProfile | null {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${id}`);
    return raw ? (JSON.parse(raw) as SwimmerProfile) : null;
  } catch {
    return null;
  }
}

export function saveSampleSwimmerProfile(profile: SwimmerProfile) {
  sessionStorage.setItem(`${PREFIX}${profile.id}`, JSON.stringify(profile));
}

export function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}
