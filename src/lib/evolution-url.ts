// O runtime do site publicado (borda) recusa chamadas feitas para um endereço IP
// puro e devolve "error code: 1003 / Direct IP access not allowed".
// Solução: trocar o IP por um hostname sslip.io que resolve para o mesmo IP.
// Ex.: http://203.0.113.10:8080 -> http://203-0-113-10.sslip.io:8080
export function evolutionBaseUrl(raw: string): string {
  const base = raw.trim().replace(/\/+$/, "");
  try {
    const url = new URL(base);
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(url.hostname)) {
      url.hostname = `${url.hostname.replace(/\./g, "-")}.sslip.io`;
      return url.toString().replace(/\/+$/, "");
    }
    return base;
  } catch {
    return base;
  }
}
