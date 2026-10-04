export const EMAIL_MAX_CHARS = 254;

const LOCAL_PART_MAX_CHARS = 64;

const EMAIL = /([A-Za-z0-9._%+-]+)@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

const deliverable = (address: string, localPart: string): boolean =>
  address.length <= EMAIL_MAX_CHARS && localPart.length <= LOCAL_PART_MAX_CHARS;

export const extractEmail = (text: string): string | null => {
  for (const [address, localPart = ''] of text.matchAll(EMAIL)) {
    if (deliverable(address, localPart)) {
      return address.toLowerCase();
    }
  }
  return null;
};
