export type RolSistema =
  | 'ADMINISTRADOR'
  | 'VENDEDOR';

export type FiltroUsuario =
  | 'TODOS'
  | 'ACTIVOS'
  | 'INACTIVOS'
  | 'ADMINISTRADOR'
  | 'VENDEDOR';

export interface RolUsuario {
  id: number;
  nombre: RolSistema;
  descripcion: string;
  activo: boolean;
}

export interface UsuarioSistema {
  id: string;
  authUserId: string;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  email: string;
  telefono: string;
  rolId: number;
  rol: RolSistema;
  rolDescripcion: string;
  activo: boolean;
  ultimoAcceso?: string | null;
  creadoEn?: string;
  actualizadoEn?: string;
  permisos: string[];
}

export interface UsuarioForm {
  /**
   * Campo único mostrado en el formulario.
   * Se almacena en usuarios.nombres y usuarios.apellidos
   * se conserva vacío para mantener compatibilidad.
   */
  nombreCompleto: string;
  email: string;
  telefono: string;
  rolId: number | null;
  rol: RolSistema;
  activo: boolean;
  password: string;
  confirmarPassword: string;
}

export interface AdministrarUsuarioRequest {
  accion:
    | 'CREAR'
    | 'ACTUALIZAR'
    | 'CAMBIAR_ESTADO';
  idUsuario?: string;
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
