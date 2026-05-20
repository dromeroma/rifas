import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.accessToken) {
    if (!auth.isAuthenticated()) auth.loadUser();
    return true;
  }
  router.navigate(['/login']);
  return false;
};
