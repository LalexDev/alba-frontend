import {
  Injectable,
  inject
} from '@angular/core';
import {
  defer,
  Observable
} from 'rxjs';

import type {
  AdministrarUsuarioRequest,
  RolSistema,
  RolUsuario,
  UsuarioForm,
  UsuarioSistema
} from '../models/usuario.model';

import {
  SupabaseService
} from './supabase.service';

interface RolDb {
  id_rol: number;
  nombre: RolSistema;
  descripcion?: string | null;
  activo: boolean;
}

interface UsuarioDb {
  id_usuario: number;
  auth_user_id?: string | null;
  id_rol: number;
  nombres: string;
  apellidos?: string | null;
  email: string;
  telefono?: string | null;
  activo: boolean;
  ultimo_acceso?: string | null;
  creado_en?: string | null;
  actualizado_en?: string | null;
  rol?: RolDb | RolDb[] | null;
}

interface RespuestaFuncion {
  ok?: boolean;
  mensaje?: string;
  idUsuario?: number;
}

@Injectable({
  providedIn: 'root'
})
export class UsuarioService {

  private readonly supabaseService =
    inject(SupabaseService);

  private readonly columnasUsuario = `
    id_usuario,
    auth_user_id,
    id_rol,
    nombres,
    apellidos,
    email,
    telefono,
    activo,
    ultimo_acceso,
    creado_en,
    actualizado_en,
    rol:roles (
      id_rol,
      nombre,
      descripcion,
      activo
    )
  `;

  listarRoles(): Observable<RolUsuario[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('roles')
          .select(`
            id_rol,
            nombre,
            descripcion,
            activo
          `)
          .eq('activo', true)
          .in('nombre', [
            'ADMINISTRADOR',
            'VENDEDOR'
          ])
          .order('id_rol', {
            ascending: true
          });

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return (data ?? []).map(
        (fila: unknown): RolUsuario => {
          const rol = fila as RolDb;

          return {
            id: Number(rol.id_rol),
            nombre: rol.nombre,
            descripcion:
              rol.descripcion || '',
            activo:
              Boolean(rol.activo)
          };
        }
      );
    });
  }

  listar(): Observable<UsuarioSistema[]> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .from('usuarios')
          .select(this.columnasUsuario)
          .order('creado_en', {
            ascending: false
          });

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }

      return (data ?? []).map(
        (fila: unknown): UsuarioSistema =>
          this.mapearUsuario(
            fila as UsuarioDb
          )
      );
    });
  }

  obtenerAuthUserIdActual():
    Observable<string | null> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .auth
          .getUser();

      if (error) {
        return null;
      }

      return data.user?.id ?? null;
    });
  }

  crear(
    form: UsuarioForm
  ): Observable<void> {
    return this.invocarAdministracion({
      accion: 'CREAR',
      usuario: {
        nombres:
          form.nombres.trim(),
        apellidos:
          form.apellidos.trim(),
        email:
          form.email
            .trim()
            .toLowerCase(),
        telefono:
          form.telefono.trim(),
        rolId:
          Number(form.rolId),
        activo:
          Boolean(form.activo),
        password:
          form.password
      }
    });
  }

  actualizar(
    idUsuario: number,
    form: UsuarioForm
  ): Observable<void> {
    return this.invocarAdministracion({
      accion: 'ACTUALIZAR',
      idUsuario,
      usuario: {
        nombres:
          form.nombres.trim(),
        apellidos:
          form.apellidos.trim(),
        email:
          form.email
            .trim()
            .toLowerCase(),
        telefono:
          form.telefono.trim(),
        rolId:
          Number(form.rolId),
        activo:
          Boolean(form.activo),
        password:
          form.password.trim() ||
          undefined
      }
    });
  }

  cambiarEstado(
    idUsuario: number,
    activo: boolean
  ): Observable<void> {
    return this.invocarAdministracion({
      accion: 'CAMBIAR_ESTADO',
      idUsuario,
      usuario: {
        activo
      }
    });
  }

  registrarUltimoAcceso():
    Observable<void> {
    return defer(async () => {
      const { error } =
        await this.supabaseService.client
          .rpc(
            'registrar_ultimo_acceso'
          );

      if (error) {
        throw new Error(
          this.traducirError(error.message)
        );
      }
    });
  }

  private invocarAdministracion(
    request: AdministrarUsuarioRequest
  ): Observable<void> {
    return defer(async () => {
      const { data, error } =
        await this.supabaseService.client
          .functions
          .invoke(
            'administrar-usuario',
            {
              body: request
            }
          );

      if (error) {
        let mensaje =
          error.message ||
          'No se pudo administrar el usuario.';

        const contexto = (
          error as unknown as {
            context?: Response;
          }
        ).context;

        if (contexto) {
          try {
            const respuesta =
              await contexto.clone().json() as {
                error?: string;
                message?: string;
              };

            mensaje =
              respuesta.error ||
              respuesta.message ||
              mensaje;
          } catch {
            // Mantener el mensaje original.
          }
        }

        throw new Error(
          this.traducirError(mensaje)
        );
      }

      const respuesta =
        data as RespuestaFuncion | null;

      if (
        respuesta &&
        respuesta.ok === false
      ) {
        throw new Error(
          respuesta.mensaje ||
          'No se pudo completar la operación.'
        );
      }
    });
  }

  private mapearUsuario(
    fila: UsuarioDb
  ): UsuarioSistema {
    const rolDb =
      this.obtenerRelacion(fila.rol);

    const rol:
      RolSistema =
      rolDb?.nombre ===
        'ADMINISTRADOR'
        ? 'ADMINISTRADOR'
        : 'VENDEDOR';

    const nombres =
      fila.nombres || '';
    const apellidos =
      fila.apellidos || '';

    return {
      id:
        Number(fila.id_usuario),
      authUserId:
        fila.auth_user_id || '',
      nombres,
      apellidos,
      nombreCompleto:
        [nombres, apellidos]
          .filter(Boolean)
          .join(' ')
          .trim(),
      email:
        fila.email || '',
      telefono:
        fila.telefono || '',
      rolId:
        Number(
          rolDb?.id_rol ??
          fila.id_rol
        ),
      rol,
      rolDescripcion:
        rolDb?.descripcion || '',
      activo:
        Boolean(fila.activo),
      ultimoAcceso:
        fila.ultimo_acceso ?? null,
      creadoEn:
        fila.creado_en ??
        undefined,
      actualizadoEn:
        fila.actualizado_en ??
        undefined,
      permisos:
        this.permisosPorRol(rol)
    };
  }

  private permisosPorRol(
    rol: RolSistema
  ): string[] {
    if (rol === 'ADMINISTRADOR') {
      return [
        'Dashboard y reportes',
        'Ventas y escáner',
        'Productos e inventario',
        'Clientes y recetas',
        'Órdenes y recibos',
        'Proveedores',
        'Movimientos de inventario',
        'Usuarios y roles'
      ];
    }

    return [
      'Ventas y escáner',
      'Productos e inventario',
      'Clientes y recetas',
      'Órdenes y recibos'
    ];
  }

  private obtenerRelacion<T>(
    relacion:
      T |
      T[] |
      null |
      undefined
  ): T | undefined {
    if (!relacion) {
      return undefined;
    }

    if (Array.isArray(relacion)) {
      return relacion[0];
    }

    return relacion;
  }

  private traducirError(
    mensaje: string
  ): string {
    const texto =
      String(mensaje || '')
        .toLowerCase();

    if (
      texto.includes(
        'administrar-usuario'
      ) ||
      texto.includes(
        'failed to send a request'
      )
    ) {
      return 'La función administrar-usuario todavía no está desplegada en Supabase.';
    }

    if (
      texto.includes(
        'uq_usuarios_email'
      ) ||
      (
        texto.includes('duplicate') &&
        texto.includes('email')
      ) ||
      texto.includes(
        'already been registered'
      )
    ) {
      return 'Ya existe un usuario registrado con ese correo.';
    }

    if (
      texto.includes('roles') ||
      texto.includes('auth_user_id') ||
      texto.includes('ultimo_acceso')
    ) {
      return 'Falta ejecutar el SQL de Usuarios y roles en Supabase.';
    }

    if (
      texto.includes(
        'row-level security'
      ) ||
      texto.includes(
        'permission denied'
      )
    ) {
      return 'No tienes permisos para consultar o administrar usuarios.';
    }

    return mensaje;
  }
}
