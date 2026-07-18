import { Component } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  Validators
} from '@angular/forms';
import { Router } from '@angular/router';
import { finalize } from 'rxjs';

import { AuthService } from '../../core/services/auth.service';
import { TokenService } from '../../core/services/token.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent {

  error = '';
  loading = false;
  form: FormGroup;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private tokenService: TokenService,
    private router: Router
  ) {
    this.form = this.fb.group({
      usernameOrCorreo: [
        '',
        [
          Validators.required,
          Validators.email
        ]
      ],
      password: [
        '',
        [
          Validators.required,
          Validators.minLength(6)
        ]
      ]
    });
  }

  submit(): void {
    if (this.form.invalid || this.loading) {
      this.form.markAllAsTouched();
      return;
    }

    this.error = '';
    this.loading = true;

    const email = String(
      this.form.get('usernameOrCorreo')?.value || ''
    )
      .trim()
      .toLowerCase();

    const password = String(
      this.form.get('password')?.value || ''
    );

    this.authService
      .login(email, password)
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: () => {
          const role = this.tokenService.getRole();

          if (role === 'ADMINISTRADOR') {
            this.router.navigateByUrl('/admin/dashboard');
            return;
          }

          if (role === 'VENDEDOR') {
            this.router.navigateByUrl('/vendedor/ventas');
            return;
          }

          this.error = 'El usuario no tiene un rol autorizado.';
          this.authService.logout();
        },

        error: (error) => {
          console.error('Error de inicio de sesión:', error);

          const message = String(
            error?.message ||
            error?.error?.message ||
            ''
          ).toLowerCase();

          if (message.includes('invalid login credentials')) {
            this.error = 'Correo o contraseña incorrectos.';
          } else if (message.includes('email not confirmed')) {
            this.error = 'El correo todavía no ha sido confirmado.';
          } else if (
            message.includes('failed to fetch') ||
            message.includes('network')
          ) {
            this.error =
              'No se pudo conectar con Supabase. Revisa tu conexión.';
          } else if (message.includes('usuario inactivo')) {
            this.error = 'El usuario se encuentra desactivado.';
          } else if (message.includes('perfil')) {
            this.error =
              'El usuario existe, pero no tiene un perfil configurado.';
          } else {
            this.error =
              error?.message ||
              error?.error?.message ||
              'No se pudo iniciar sesión.';
          }
        }
      });
  }
}