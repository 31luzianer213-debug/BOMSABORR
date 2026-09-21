export type Coordinates = { latitude: number; longitude: number };
export type LocationAddress = { neighborhood: string | null; city: string | null; deliveryArea: string | null };

const MOJUI_URBAN_CENTER: Coordinates = { latitude: -2.682167, longitude: -54.642717 };

function distanceInKm(from: Coordinates, to: Coordinates) {
  const radians = (degrees: number) => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a = Math.sin(latitudeDelta / 2) ** 2 + Math.cos(radians(from.latitude)) * Math.cos(radians(to.latitude)) * Math.sin(longitudeDelta / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function coordinatesFromMapsUrl(value: string): Coordinates | null {
  const match = value.match(/(?:[?&]q=|@)(-?\d{1,3}(?:\.\d+)?),\s*(-?\d{1,3}(?:\.\d+)?)/i);
  if (!match) return null;
  const latitude = Number(match[1]);
  const longitude = Number(match[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return { latitude, longitude };
}

export async function identifyLocationAddress(coordinates: Coordinates): Promise<LocationAddress> {
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("lat", String(coordinates.latitude));
  url.searchParams.set("lon", String(coordinates.longitude));
  url.searchParams.set("zoom", "18");
  url.searchParams.set("addressdetails", "1");
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8_000),
    headers: { Accept: "application/json", "User-Agent": "BomSabor-Pedidos/1.0" },
  });
  if (!response.ok) return { neighborhood: null, city: null, deliveryArea: null };
  const result = (await response.json()) as { address?: Record<string, string | undefined>; type?: string };
  const address = result.address;
  if (!address) return { neighborhood: null, city: null, deliveryArea: null };
  const city = address["city"] ?? address["town"] ?? address["municipality"] ?? address["village"] ?? null;
  const neighborhood = address["suburb"] ?? address["neighbourhood"] ?? address["quarter"] ?? null;
  const normalized = neighborhood?.toLocaleLowerCase("pt-BR") ?? "";
  const known = normalized.includes("bairro novo") ? "Bairro Novo" : normalized.includes("centro") ? "Centro" : null;
  const isMojui = city?.toLocaleLowerCase("pt-BR").includes("mojuí dos campos") ?? false;
  const isUrban = isMojui && (result.type === "residential" || distanceInKm(coordinates, MOJUI_URBAN_CENTER) <= 4.5);
  return { neighborhood, city, deliveryArea: known ?? (isUrban ? "Centro" : isMojui ? "Zona Rural" : null) };
}