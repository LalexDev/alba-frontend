import {
  createClient
} from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods':
    'POST, OPTIONS'
};

type RolNombre =
  | 'ADMINISTRADOR'
  | 'VENDEDOR';

interface Solicitud {
  accion:
    | 'CREAR'
    | 'ACTUALIZAR'
    | 'CAMBIAR_ESTADO';
  idUsuario?: number;
  usuario?: {
    nombres?: string;
    apellidos?: string;
    email?: string;
    telefono?: string;
    rolId?: number;
    activo?: boolean;
    password?: string;
  };
}

const respuesta = (
  body: Record<string, unknown>,
  status = 200
): Response =>
  new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...corsHeaders,
        'Content-Type':
          'application/json'
      }
    }
  );

const relacionUnica = <T>(
  relacion:
    T |
    T[] |
    null |
    undefined
): T | undefined => {
  if (!relacion) {
    return undefined;
  }

  if (Array.isArray(relacion)) {
    return relacion[0];
  }

  return relacion;
};

Deno.serve(
  async (
    req: Request
  ): Promise<Response> => {
    if (req.method === 'OPTIONS') {
      return new Response(
        'ok',
        {
          headers: corsHeaders
        }
      );
    }

    if (req.method !== 'POST') {
      return respuesta(
        {
          error:
            'Método no permitido.'
        },
        405
      );
    }

    try {
      const supabaseUrl =
        Deno.env.get(
          'SUPABASE_URL'
        );

      const publishableKeys =
        JSON.parse(
          Deno.env.get(
            'SUPABASE_PUBLISHABLE_KEYS'
          ) || '{}'
        ) as Record<string, string>;

      const secretKeys =
        JSON.parse(
          Deno.env.get(
            'SUPABASE_SECRET_KEYS'
          ) || '{}'
        ) as Record<string, string>;

      const publicKey =
        Deno.env.get(
          'SUPABASE_ANON_KEY'
        ) ||
        publishableKeys['default'];

      const secretKey =
        Deno.env.get(
          'SUPABASE_SERVICE_ROLE_KEY'
        ) ||
        secretKeys['default'];

      if (
        !supabaseUrl ||
        !publicKey ||
        !secretKey
      ) {
        return respuesta(
          {
            error:
              'Faltan las variables de Supabase en la función.'
          },
          500
        );
      }

      const authorization =
        req.headers.get(
          'Authorization'
        );

      if (!authorization) {
        return respuesta(
          {
            error:
              'Sesión no encontrada.'
          },
          401
        );
      }

      const supabaseUsuario =
        createClient(
          supabaseUrl,
          publicKey,
          {
            global: {
              headers: {
                Authorization:
                  authorization
              }
            },
            auth: {
              persistSession: false
            }
          }
        );

      const supabaseAdmin =
        createClient(
          supabaseUrl,
          secretKey,
          {
            auth: {
              persistSession: false,
              autoRefreshToken: false
            }
          }
        );

      const token =
        authorization.replace(
          /^Bearer\s+/i,
          ''
        );

      const {
        data: usuarioAutenticado,
        error: errorAutenticacion
      } =
        await supabaseUsuario
          .auth
          .getUser(token);

      if (
        errorAutenticacion ||
        !usuarioAutenticado.user
      ) {
        return respuesta(
          {
            error:
              'La sesión no es válida.'
          },
          401
        );
      }

      const {
        data: perfilAdministrador,
        error: errorPerfil
      } =
        await supabaseAdmin
          .from('usuarios')
          .select(`
            id_usuario,
            auth_user_id,
            activo,
            rol:roles (
              nombre
            )
          `)
          .eq(
            'auth_user_id',
            usuarioAutenticado.user.id
          )
          .single();

      if (
        errorPerfil ||
        !perfilAdministrador
      ) {
        return respuesta(
          {
            error:
              'No existe un perfil asociado a la sesión.'
          },
          403
        );
      }

      const rolAdministrador =
        relacionUnica(
          perfilAdministrador.rol as
            | {
                nombre?: RolNombre;
              }
            | {
                nombre?: RolNombre;
              }[]
            | null
        );

      if (
        !perfilAdministrador.activo ||
        rolAdministrador?.nombre !==
          'ADMINISTRADOR'
      ) {
        return respuesta(
          {
            error:
              'Solo un administrador activo puede gestionar usuarios.'
          },
          403
        );
      }

      const body =
        await req.json() as Solicitud;

      const accion =
        body.accion;

      if (
        accion !== 'CREAR' &&
        accion !== 'ACTUALIZAR' &&
        accion !== 'CAMBIAR_ESTADO'
      ) {
        return respuesta(
          {
            error:
              'Acción no válida.'
          },
          400
        );
      }

      const datos =
        body.usuario || {};

      if (accion === 'CREAR') {
        const nombres =
          String(
            datos.nombres || ''
          ).trim();

        const apellidos =
          String(
            datos.apellidos || ''
          ).trim();

        const email =
          String(
            datos.email || ''
          )
            .trim()
            .toLowerCase();

        const password =
          String(
            datos.password || ''
          );

        const rolId =
          Number(datos.rolId);

        if (!nombres) {
          return respuesta(
            {
              error:
                'Los nombres son obligatorios.'
            },
            400
          );
        }

        if (
          !email ||
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
            .test(email)
        ) {
          return respuesta(
            {
              error:
                'El correo no es válido.'
            },
            400
          );
        }

        if (
          password.length < 8
        ) {
          return respuesta(
            {
              error:
                'La contraseña debe contener al menos 8 caracteres.'
            },
            400
          );
        }

        const {
          data: rol,
          error: errorRol
        } =
          await supabaseAdmin
            .from('roles')
            .select(
              'id_rol, nombre, activo'
            )
            .eq(
              'id_rol',
              rolId
            )
            .eq(
              'activo',
              true
            )
            .single();

        if (
          errorRol ||
          !rol ||
          ![
            'ADMINISTRADOR',
            'VENDEDOR'
          ].includes(rol.nombre)
        ) {
          return respuesta(
            {
              error:
                'El rol seleccionado no es válido.'
            },
            400
          );
        }

        const {
          data: authCreado,
          error: errorAuth
        } =
          await supabaseAdmin
            .auth
            .admin
            .createUser({
              email,
              password,
              email_confirm: true,
              user_metadata: {
                nombres,
                apellidos
              },
              app_metadata: {
                rol:
                  rol.nombre
              }
            });

        if (
          errorAuth ||
          !authCreado.user
        ) {
          return respuesta(
            {
              error:
                errorAuth?.message ||
                'No se pudo crear el acceso del usuario.'
            },
            400
          );
        }

        const {
          data: perfilCreado,
          error: errorInsert
        } =
          await supabaseAdmin
            .from('usuarios')
            .insert({
              auth_user_id:
                authCreado.user.id,
              id_rol:
                rol.id_rol,
              nombres,
              apellidos,
              email,
              telefono:
                String(
                  datos.telefono || ''
                ).trim() ||
                null,
              activo:
                datos.activo !== false
            })
            .select(
              'id_usuario'
            )
            .single();

        if (
          errorInsert ||
          !perfilCreado
        ) {
          await supabaseAdmin
            .auth
            .admin
            .deleteUser(
              authCreado.user.id
            );

          return respuesta(
            {
              error:
                errorInsert?.message ||
                'No se pudo crear el perfil del usuario.'
            },
            400
          );
        }

        if (
          datos.activo === false
        ) {
          await supabaseAdmin
            .auth
            .admin
            .updateUserById(
              authCreado.user.id,
              {
                ban_duration:
                  '876000h'
              }
            );
        }

        return respuesta({
          ok: true,
          idUsuario:
            perfilCreado.id_usuario,
          mensaje:
            'Usuario creado correctamente.'
        });
      }

      const idUsuario =
        Number(body.idUsuario);

      if (!idUsuario) {
        return respuesta(
          {
            error:
              'No se indicó el usuario.'
          },
          400
        );
      }

      const {
        data: perfilObjetivo,
        error: errorObjetivo
      } =
        await supabaseAdmin
          .from('usuarios')
          .select(`
            id_usuario,
            auth_user_id,
            id_rol,
            email,
            activo,
            rol:roles (
              nombre
            )
          `)
          .eq(
            'id_usuario',
            idUsuario
          )
          .single();

      if (
        errorObjetivo ||
        !perfilObjetivo
      ) {
        return respuesta(
          {
            error:
              'El usuario seleccionado no existe.'
          },
          404
        );
      }

      if (
        !perfilObjetivo.auth_user_id
      ) {
        return respuesta(
          {
            error:
              'El perfil no está vinculado con Supabase Auth.'
          },
          400
        );
      }

      if (
        accion ===
          'CAMBIAR_ESTADO'
      ) {
        const activo =
          Boolean(datos.activo);

        if (
          perfilObjetivo.auth_user_id ===
            usuarioAutenticado.user.id &&
          !activo
        ) {
          return respuesta(
            {
              error:
                'No puedes desactivar tu propia cuenta.'
            },
            400
          );
        }

        const rolObjetivo =
          relacionUnica(
            perfilObjetivo.rol as
              | {
                  nombre?: RolNombre;
                }
              | {
                  nombre?: RolNombre;
                }[]
              | null
          );

        if (
          rolObjetivo?.nombre ===
            'ADMINISTRADOR' &&
          perfilObjetivo.activo &&
          !activo
        ) {
          const {
            count
          } =
            await supabaseAdmin
              .from('usuarios')
              .select(
                'id_usuario, roles!inner(nombre)',
                {
                  count: 'exact',
                  head: true
                }
              )
              .eq(
                'activo',
                true
              )
              .eq(
                'roles.nombre',
                'ADMINISTRADOR'
              );

          if (
            Number(count || 0) <= 1
          ) {
            return respuesta(
              {
                error:
                  'Debe permanecer al menos un administrador activo.'
              },
              400
            );
          }
        }

        const {
          error: errorActualizarAuth
        } =
          await supabaseAdmin
            .auth
            .admin
            .updateUserById(
              perfilObjetivo.auth_user_id,
              {
                ban_duration:
                  activo
                    ? 'none'
                    : '876000h'
              }
            );

        if (errorActualizarAuth) {
          return respuesta(
            {
              error:
                errorActualizarAuth.message
            },
            400
          );
        }

        const {
          error: errorEstado
        } =
          await supabaseAdmin
            .from('usuarios')
            .update({
              activo
            })
            .eq(
              'id_usuario',
              idUsuario
            );

        if (errorEstado) {
          return respuesta(
            {
              error:
                errorEstado.message
            },
            400
          );
        }

        return respuesta({
          ok: true,
          mensaje:
            activo
              ? 'Usuario activado.'
              : 'Usuario desactivado.'
        });
      }

      const nombres =
        String(
          datos.nombres || ''
        ).trim();

      const apellidos =
        String(
          datos.apellidos || ''
        ).trim();

      const email =
        String(
          datos.email || ''
        )
          .trim()
          .toLowerCase();

      const rolId =
        Number(datos.rolId);

      if (
        !nombres ||
        !email ||
        !rolId
      ) {
        return respuesta(
          {
            error:
              'Completa nombres, correo y rol.'
          },
          400
        );
      }

      const {
        data: rolNuevo,
        error: errorRolNuevo
      } =
        await supabaseAdmin
          .from('roles')
          .select(
            'id_rol, nombre, activo'
          )
          .eq(
            'id_rol',
            rolId
          )
          .eq(
            'activo',
            true
          )
          .single();

      if (
        errorRolNuevo ||
        !rolNuevo
      ) {
        return respuesta(
          {
            error:
              'El rol seleccionado no es válido.'
          },
          400
        );
      }

      const atributosAuth:
        Record<string, unknown> = {
          email,
          email_confirm: true,
          user_metadata: {
            nombres,
            apellidos
          },
          app_metadata: {
            rol:
              rolNuevo.nombre
          },
          ban_duration:
            datos.activo === false
              ? '876000h'
              : 'none'
        };

      const password =
        String(
          datos.password || ''
        );

      if (password) {
        if (
          password.length < 8
        ) {
          return respuesta(
            {
              error:
                'La contraseña debe contener al menos 8 caracteres.'
            },
            400
          );
        }

        atributosAuth['password'] =
          password;
      }

      const {
        error: errorActualizarAuth
      } =
        await supabaseAdmin
          .auth
          .admin
          .updateUserById(
            perfilObjetivo.auth_user_id,
            atributosAuth as any
          );

      if (errorActualizarAuth) {
        return respuesta(
          {
            error:
              errorActualizarAuth.message
          },
          400
        );
      }

      const {
        error: errorActualizarPerfil
      } =
        await supabaseAdmin
          .from('usuarios')
          .update({
            id_rol:
              rolNuevo.id_rol,
            nombres,
            apellidos,
            email,
            telefono:
              String(
                datos.telefono || ''
              ).trim() ||
              null,
            activo:
              datos.activo !== false
          })
          .eq(
            'id_usuario',
            idUsuario
          );

      if (errorActualizarPerfil) {
        return respuesta(
          {
            error:
              errorActualizarPerfil.message
          },
          400
        );
      }

      return respuesta({
        ok: true,
        mensaje:
          'Usuario actualizado correctamente.'
      });
    } catch (error) {
      console.error(
        'Error en administrar-usuario:',
        error
      );

      return respuesta(
        {
          error:
            error instanceof Error
              ? error.message
              : 'Error inesperado.'
        },
        500
      );
    }
  }
);
