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
  precioCompra: number;
  precioVenta: number;
  stockActual: number;
  stockMinimo: number;
  categoriaId: number;
  marcaId?: number | null;
  proveedorId?: number | null;
}
