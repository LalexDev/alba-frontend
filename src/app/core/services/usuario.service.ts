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
  nombre: string;
  descripcion?: string | null;
  activo: boolean;
}

interface UsuarioDb {
  id_usuario: string;
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
  idUsuario?: string;
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
    rol:roles!fk_usuarios_rol (
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
          .order(
            'id_rol',
            {
              ascending: true
            }
          );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }

      const roles =
        (data ?? [])
          .map(
            (fila: unknown):
              RolUsuario | null => {
              const rol =
                fila as RolDb;

              const nombre =
                this.normalizarRol(
                  rol.nombre
                );

              if (!nombre) {
                return null;
              }

              return {
                id:
                  Number(
                    rol.id_rol
                  ),
                nombre,
                descripcion:
                  rol.descripcion ||
                  (
                    nombre ===
                      'ADMINISTRADOR'
                      ? 'Acceso completo a todos los módulos del sistema.'
                      : 'Acceso operativo a ventas, productos, clientes y órdenes.'
                  ),
                activo:
                  Boolean(
                    rol.activo
                  )
              };
            }
          )
          .filter(
            (
              rol
            ): rol is RolUsuario =>
              Boolean(
                rol &&
                rol.activo
              )
          )
          .sort(
            (
              a,
              b
            ) => {
              if (
                a.nombre ===
                b.nombre
              ) {
                return a.id - b.id;
              }

              return a.nombre ===
                'ADMINISTRADOR'
                ? -1
                : 1;
            }
          );

      const rolesUnicos =
        roles.filter(
          (
            rol,
            indice,
            arreglo
          ) =>
            arreglo.findIndex(
              item =>
                item.nombre ===
                rol.nombre
            ) === indice
        );

      const tieneAdministrador =
        rolesUnicos.some(
          rol =>
            rol.nombre ===
            'ADMINISTRADOR'
        );

      const tieneVendedor =
        rolesUnicos.some(
          rol =>
            rol.nombre ===
            'VENDEDOR'
        );

      if (
        !tieneAdministrador ||
        !tieneVendedor
      ) {
        throw new Error(
          'No están disponibles los roles Administrador y Vendedor. Ejecuta el archivo 19_corregir_catalogo_roles.sql en Supabase.'
        );
      }

      return rolesUnicos;
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
          form.nombreCompleto
            .replace(
              /\s+/g,
              ' '
            )
            .trim(),
        apellidos: '',
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
    idUsuario: string,
    form: UsuarioForm
  ): Observable<void> {
    return defer(async () => {
      const idLimpio =
        String(
          idUsuario || ''
        ).trim();

      if (!idLimpio) {
        throw new Error(
          'No se indicó el usuario que se desea actualizar.'
        );
      }

      if (!form.rolId) {
        throw new Error(
          'Selecciona el rol del usuario.'
        );
      }

      const {
        error
      } =
        await this.supabaseService.client
          .rpc(
            'actualizar_usuario_perfil',
            {
              p_id_usuario:
                idLimpio,
              p_nombres:
                form.nombreCompleto
                  .replace(
                    /\s+/g,
                    ' '
                  )
                  .trim(),
              p_apellidos:
                '',
              p_telefono:
                form.telefono
                  .trim(),
              p_id_rol:
                Number(
                  form.rolId
                )
            }
          );

      if (error) {
        throw new Error(
          this.traducirError(
            error.message
          )
        );
      }
    });
  }

  cambiarEstado(
    idUsuario: string,
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
      this.normalizarRol(
        rolDb?.nombre ||
        ''
      ) ||
      'VENDEDOR';

    const nombres =
      fila.nombres || '';
    const apellidos =
      fila.apellidos || '';

    return {
      id:
        String(fila.id_usuario),
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

  private normalizarRol(
    valor: string
  ): RolSistema | null {
    const nombre =
      String(
        valor || ''
      )
        .normalize('NFD')
        .replace(
          /[\u0300-\u036f]/g,
          ''
        )
        .trim()
        .toUpperCase()
        .replace(
          /[^A-Z]/g,
          ''
        );

    if (
      [
        'ADMIN',
        'ADMINISTRADOR',
        'ADMINISTRADORA'
      ].includes(nombre)
    ) {
      return 'ADMINISTRADOR';
    }

    if (
      [
        'VENDEDOR',
        'VENDEDORA',
        'SELLER'
      ].includes(nombre)
    ) {
      return 'VENDEDOR';
    }

    return null;
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
        'Caja y cierre diario',
        'Proveedores',
        'Movimientos de inventario',
        'Usuarios y roles'
      ];
    }

    return [
      'Ventas y escáner',
      'Productos e inventario',
      'Clientes y recetas',
      'Órdenes y recibos',
      'Caja y cierre diario'
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
        'id_usuario'
      ) &&
      (
        texto.includes(
          'violates not-null constraint'
        ) ||
        texto.includes(
          'type uuid'
        ) ||
        texto.includes(
          'type bigint'
        )
      )
    ) {
      return 'La columna usuarios.id_usuario debe generar UUID automáticamente. Ejecuta el archivo 21_corregir_id_usuario_uuid.sql en Supabase.';
    }

    if (
      texto.includes(
        '19_corregir_catalogo_roles.sql'
      ) ||
      texto.includes(
        'no estan disponibles los roles'
      )
    ) {
      return 'No están disponibles los roles Administrador y Vendedor. Ejecuta el archivo 19_corregir_catalogo_roles.sql en Supabase.';
    }

    if (
      texto.includes(
        'actualizar_usuario_perfil'
      ) ||
      (
        texto.includes(
          'could not find the function'
        ) &&
        texto.includes(
          'actualizar_usuario_perfil'
        )
      )
    ) {
      return 'Falta ejecutar 41_actualizar_usuario_perfil.sql en Supabase.';
    }

    if (
      texto.includes(
        'solo el administrador puede actualizar usuarios'
      )
    ) {
      return 'Solo el administrador puede actualizar los datos de otros usuarios.';
    }

    if (
      texto.includes(
        'usuario a actualizar no encontrado'
      )
    ) {
      return 'No se encontró el usuario seleccionado en la base de datos.';
    }

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
      texto.includes(
        'could not find a relationship'
      ) ||
      (
        texto.includes('usuarios') &&
        texto.includes('roles') &&
        texto.includes('schema cache')
      )
    ) {
      return 'Supabase no reconoce la relación entre usuarios y roles. Ejecuta el archivo 17_corregir_relacion_usuarios_roles.sql.';
    }

    if (
      texto.includes(
        'more than one relationship'
      ) ||
      texto.includes(
        'ambiguous'
      )
    ) {
      return 'Existen relaciones duplicadas entre usuarios y roles. Ejecuta el archivo 17_corregir_relacion_usuarios_roles.sql.';
    }

    if (
      texto.includes(
        'infinite recursion'
      )
    ) {
      return 'Las políticas de usuarios tienen una recursión. Ejecuta el archivo 17_corregir_relacion_usuarios_roles.sql.';
    }

    if (
      texto.includes(
        'auth_user_id'
      ) ||
      texto.includes(
        'ultimo_acceso'
      )
    ) {
      return 'Faltan columnas necesarias en la tabla usuarios. Ejecuta el archivo 17_corregir_relacion_usuarios_roles.sql.';
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
