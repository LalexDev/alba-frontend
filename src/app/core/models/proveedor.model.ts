export type TipoDocumentoProveedor =
  | 'RUC'
  | 'DNI'
  | 'CE'
  | 'OTRO';

export type FiltroProveedor =
  | 'TODOS'
  | 'ACTIVOS'
  | 'INACTIVOS'
  | 'BAJO_STOCK'
  | 'SIN_PRODUCTOS';

export interface ProductoProveedorResumen {
  id: number;
  nombre: string;
  categoria: string;
  stockActual: number;
  stockMinimo: number;
}

export interface Proveedor {
  id: number;
  tipoDocumento: TipoDocumentoProveedor;
  numeroDocumento: string;
  razonSocial: string;
  nombreContacto: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  medioPago: string;
  observaciones: string;
  activo: boolean;
  creadoEn?: string;
  actualizadoEn?: string;

  productos: ProductoProveedorResumen[];
  categorias: string[];
  cantidadProductos: number;
  productosBajoStock: number;
  ultimaCompra?: string | null;
  totalComprado: number;
}

export interface ProveedorForm {
  tipoDocumento: TipoDocumentoProveedor;
  numeroDocumento: string;
  razonSocial: string;
  nombreContacto: string;
  telefono: string;
  correo: string;
  direccion: string;
  ciudad: string;
  medioPago: string;
  observaciones: string;
  activo: boolean;
}
