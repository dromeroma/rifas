import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { UserRole } from '../models/user.model';

export const roleGuard =
  (allowed: UserRole[]): CanActivateFn =>
  () => {
    const auth = inject(AuthService);
    const router = inject(Router);
    const role = auth.role();
    if (role && allowed.includes(role)) return true;
    router.navigate(['/login']);
    return false;
  };
