export interface Categoria {
  id: number;
  nombre: string;
  descripcion?: string;
  estado?: boolean;
}

export interface Marca {
  id: number;
  nombre: string;
  estado?: boolean;
}

export interface Proveedor {
  id: number;
  razonSocial?: string;
  contacto?: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  estado?: boolean;
}

export interface Producto {
  id: number;
  codigoInterno?: string;
  codigoBarras: string;
  nombre: string;
  descripcion?: string;
  modelo?: string;
  color?: string;
  medida?: string;
  material?: string;
  sexo?: 'F' | 'M';
  precioCompra?: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo?: number;
  fechaIngreso?: string;
  estado: boolean;
  categoria?: Categoria;
  marca?: Marca;
  proveedor?: Proveedor;
}

export interface ProductoRequest {
  codigoInterno?: string;
  codigoBarras: string;
  nombre: string;
  descripcion?: string;
  modelo?: string;
  color?: string;
  medida?: string;
  material?: string;
  sexo?: 'F' | 'M' | null;
  precioCompra: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  categoriaId: number;
  marcaId?: number | null;
  proveedorId?: number | null;
}


export type AccionRegistroProducto =
  'CREADO' |
  'STOCK_INCREMENTADO' |
  'ACTUALIZADO';

export interface ResultadoRegistroProducto {
  producto: Producto;
  accion: AccionRegistroProducto;
  cantidadAgregada: number;
  stockAnterior: number;
  stockNuevo: number;
}


export type AccionEliminacionProducto =
  'ELIMINADO' |
  'DESACTIVADO';

export interface ResultadoEliminacionProducto {
  idProducto: number;
  accion: AccionEliminacionProducto;
  mensaje: string;
}


/**
 * Resultado de una lectura realizada desde Ventas.
 *
 * CODIGO_UNICO:
 * el lector encontró un código OPT exacto.
 *
 * MEDIDA:
 * el lector encontró una medida repetible y el vendedor
 * debe elegir la montura correcta.
 */
export type TipoBusquedaEscanerProducto =
  'CODIGO_UNICO' |
  'MEDIDA';

export interface ResultadoBusquedaEscanerProducto {
  tipo: TipoBusquedaEscanerProducto;
  valorEscaneado: string;
  productos: Producto[];
}
