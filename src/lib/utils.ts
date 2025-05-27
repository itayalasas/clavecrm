import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

function findFirstVowel(str: string): string | null {
  const vowels = "AEIOUaeiou";
  for (let i = 0; i < str.length; i++) {
    if (vowels.includes(str[i])) {
      return str[i];
    }
  }
  return null; // No vowel found
}

export function getUserInitials(name?: string | null): string {
  if (!name || typeof name !== 'string' || name.trim() === "") return "?";

  const nameParts = name.trim().split(/\s+/).filter(part => part.length > 0);

  if (nameParts.length === 0) return "?";

  if (nameParts.length === 1) {
    // For a single name part, take the first two letters if available
    return nameParts[0].substring(0, 2).toUpperCase();
  } else {
    // For multiple name parts, take the first letter of the first part
    // and the first letter of the last part, prioritizing the first vowel.
    const firstPart = nameParts[0];
    const lastPart = nameParts[nameParts.length - 1];

    const firstInitial = findFirstVowel(firstPart) || firstPart[0];
    const lastInitial = findFirstVowel(lastPart) || lastPart[0];
    return `${firstInitial || '?'}${lastInitial || '?'}`.toUpperCase();
  }
}
