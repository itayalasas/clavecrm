import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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
    // and the first letter of the last part.
    const firstInitial = nameParts[0][0];
    const lastInitial = nameParts[nameParts.length - 1][0];
    return `${firstInitial}${lastInitial}`.toUpperCase();
  }
}
