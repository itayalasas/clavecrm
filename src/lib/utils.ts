import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function getUserInitials(name?: string | null): string {
  if (!name || name.trim() === "") return "?"; // Default for empty or null name
  const nameParts = name.trim().split(/\s+/).filter(part => part.length > 0); // Filter out empty parts

  if (nameParts.length === 1 && nameParts[0]) {
    return nameParts[0].substring(0, 2).toUpperCase(); // "Juan" -> "JU"
  }
  if (nameParts.length > 1 && nameParts[0] && nameParts[1]) {
    return `${nameParts[0][0]}${nameParts[1][0]}`.toUpperCase(); // "Juan Pérez" -> "JP"
  }
  if (nameParts.length > 0 && nameParts[0]) { // If only one part after filtering (e.g., single name with spaces)
    return nameParts[0].substring(0, 2).toUpperCase();
  }
  return "?"; // Final fallback if name is unusual
}
