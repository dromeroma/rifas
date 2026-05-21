import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

import { environment } from '@env/environment';
import {
  Tenant, TenantCreatePayload, TenantUpdatePayload,
} from '../models/tenant.model';

@Injectable({ providedIn: 'root' })
export class TenantsService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/admin/tenants`;

  list(): Observable<Tenant[]> {
    return this.http.get<Tenant[]>(this.api);
  }

  get(id: number): Observable<Tenant> {
    return this.http.get<Tenant>(`${this.api}/${id}`);
  }

  create(payload: TenantCreatePayload): Observable<Tenant> {
    return this.http.post<Tenant>(this.api, payload);
  }

  update(id: number, payload: TenantUpdatePayload): Observable<Tenant> {
    return this.http.patch<Tenant>(`${this.api}/${id}`, payload);
  }
}
