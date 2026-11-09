export interface SavedAddress {
  display_name: string;
  lat: number;
  lng: number;
  street?: string;
  house_number?: string;
  postcode?: string;
  city?: string;
}

const STORAGE_KEY = "rzfood_saved_address";

export function getSavedAddress(): SavedAddress | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object") return null;
    const address = value as Partial<SavedAddress>;
    return typeof address.display_name === "string" && typeof address.lat === "number" && typeof address.lng === "number"
      ? address as SavedAddress
      : null;
  } catch {
    return null;
  }
}

export function setSavedAddress(address: SavedAddress | null): void {
  if (address) localStorage.setItem(STORAGE_KEY, JSON.stringify(address));
  else localStorage.removeItem(STORAGE_KEY);
}
