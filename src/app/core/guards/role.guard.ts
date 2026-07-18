import { Injectable } from '@angular/core';
import { ActivatedRouteSnapshot, CanActivate, Router } from '@angular/router';
import { TokenService } from '../services/token.service';

@Injectable({ providedIn: 'root' })
export class RoleGuard implements CanActivate {
  constructor(private tokenService: TokenService, private router: Router) {}

  canActivate(route: ActivatedRouteSnapshot): boolean {
    const role = this.tokenService.getRole();
    const roles = route.data['roles'] as string[];
    if (!role || !roles.includes(role)) {
      this.router.navigate(['/login']);
      return false;
    }
    return true;
  }
}
