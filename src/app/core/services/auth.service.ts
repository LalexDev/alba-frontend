import { Injectable } from '@angular/core';
import { defer, Observable, tap } from 'rxjs';

import { SupabaseService } from './supabase.service';
import { TokenService } from './token.service';

interface LoginResponse {
  token: string;
  role: 'ADMINISTRADOR' | 'VENDEDOR';
}

interface PerfilUsuario {
  id_usuario: string;
  id_rol: number;
  nombres: string | null;
  apellidos: string | null;
  email: string;
  activo: boolean;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  constructor(
    private supabaseService: SupabaseService,
    private tokenService: TokenService
  ) {}

  login(correo: string, password: string): Observable<LoginResponse> {
    return defer(() =>
      this.autenticarConSupabase(correo, password)
    ).pipe(
      tap((respuesta) => {
        this.tokenService.setSession(
          respuesta.token,
          respuesta.role
        );
      })
    );
  }

  private async autenticarConSupabase(
    correo: string,
    password: string
  ): Promise<LoginResponse> {

    const emailNormalizado = correo
      .trim()
      .toLowerCase();

    /*
     * 1. Autenticar contra auth.users de Supabase
     */
    const {
      data: authData,
      error: authError
    } = await this.supabaseService.client.auth.signInWithPassword({
      email: emailNormalizado,
      password
    });

    if (authError) {
      throw authError;
    }

    const usuarioAuth = authData.user;
    const sesion = authData.session;

    if (!usuarioAuth || !sesion?.access_token) {
      throw new Error(
        'Supabase no devolvió una sesión válida.'
      );
    }

    /*
     * 2. Buscar el perfil del usuario en public.usuarios
     */
    const {
      data: perfil,
      error: perfilError
    } = await this.supabaseService.client
      .from('usuarios')
      .select(`
        id_usuario,
        id_rol,
        nombres,
        apellidos,
        email,
        activo
      `)
      .eq('id_usuario', usuarioAuth.id)
      .maybeSingle<PerfilUsuario>();

    if (perfilError) {
      await this.supabaseService.client.auth.signOut();

      throw new Error(
        `No se pudo consultar el perfil: ${perfilError.message}`
      );
    }

    if (!perfil) {
      await this.supabaseService.client.auth.signOut();

      throw new Error(
        'El usuario existe en Authentication, pero no tiene un perfil en public.usuarios.'
      );
    }

    if (!perfil.activo) {
      await this.supabaseService.client.auth.signOut();

      throw new Error(
        'El usuario se encuentra inactivo.'
      );
    }

    /*
     * 3. Consultar el nombre del rol
     */
    const {
      data: rolData,
      error: rolError
    } = await this.supabaseService.client
      .from('roles')
      .select('nombre')
      .eq('id_rol', perfil.id_rol)
      .single();

    if (rolError || !rolData) {
      await this.supabaseService.client.auth.signOut();

      throw new Error(
        rolError?.message ||
        'No se encontró el rol del usuario.'
      );
    }

    const role = String(rolData.nombre)
      .trim()
      .toUpperCase();

    if (
      role !== 'ADMINISTRADOR' &&
      role !== 'VENDEDOR'
    ) {
      await this.supabaseService.client.auth.signOut();

      throw new Error(
        'El usuario no tiene un rol autorizado.'
      );
    }

    /*
     * 4. Datos que utiliza el menú de Angular
     */
    const nombreCompleto = [
      perfil.nombres,
      perfil.apellidos
    ]
      .filter(Boolean)
      .join(' ')
      .trim();

    localStorage.setItem(
      'nombreCompleto',
      nombreCompleto || perfil.email
    );

    localStorage.setItem(
      'usuarioEmail',
      perfil.email
    );

    return {
      token: sesion.access_token,
      role: role as 'ADMINISTRADOR' | 'VENDEDOR'
    };
  }

  logout(): void {
    this.tokenService.clear();

    localStorage.removeItem('nombreCompleto');
    localStorage.removeItem('usuarioEmail');

    void this.supabaseService.client.auth.signOut();
  }

  isAuthenticated(): boolean {
    return Boolean(this.tokenService.getToken());
  }
}