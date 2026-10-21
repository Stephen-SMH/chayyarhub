import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

type Params = Record<string, string | number | boolean | null | undefined>;

/** `/api/…` with the given query parameters, leaving out empty ones. For httpResource. */
export function apiUrl(path: string, params: Params = {}): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') q.set(k, String(v));
  const s = q.toString();
  return `/api${path}${s ? `?${s}` : ''}`;
}

/** A readable message from a failed request. */
export function errorText(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    const m = e.error?.message;
    if (Array.isArray(m)) return m.join(' ');
    if (typeof m === 'string') return m;
    if (e.status === 0) return "Can't reach the ChayYarHub server.";
    return `${e.status} ${e.statusText}`;
  }
  return e instanceof Error ? e.message : String(e);
}

/** Calls that change something. Reads use httpResource in the pages. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  get<T>(path: string, params?: Params): Promise<T> {
    return firstValueFrom(this.http.get<T>(apiUrl(path, params)));
  }
  post<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.post<T>(apiUrl(path), body));
  }
  patch<T>(path: string, body: unknown): Promise<T> {
    return firstValueFrom(this.http.patch<T>(apiUrl(path), body));
  }
  put<T>(path: string, body: unknown = {}): Promise<T> {
    return firstValueFrom(this.http.put<T>(apiUrl(path), body));
  }
  delete<T>(path: string): Promise<T> {
    return firstValueFrom(this.http.delete<T>(apiUrl(path)));
  }
}
