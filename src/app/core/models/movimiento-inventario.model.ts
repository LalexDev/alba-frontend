export type TipoMovimientoVista =
  | 'ENTRADA'
  | 'SALIDA'
  | 'AJUSTE';

export type TipoMovimientoInventario =
  | 'ENTRADA_COMPRA'
  | 'SALIDA_VENTA'
  | 'AJUSTE_ENTRADA'
  | 'AJUSTE_SALIDA'
  | 'ANULACION_VENTA'
  | 'ANULACION_COMPRA'
  | 'DEVOLUCION_CLIENTE'
  | 'DEVOLUCION_PROVEEDOR';

export interface MovimientoInventario {
  id: number;
  fecha: string;

  productoId: number;
  codigo: string;
  producto: string;

  tipo: TipoMovimientoInventario;
  cantidad: number;

  stockAnterior: number;
  stockNuevo: number;

  motivo: string;
  usuario: string;

  referenciaTipo?: string;
  referenciaId?: number | null;
}

export interface RegistrarMovimientoRequest {
  productoId: number;
  tipo: TipoMovimientoVista;
  cantidad: number;
  motivo?: string;
}

export interface RegistrarMovimientoRespuesta {
  idMovimiento: number;
  productoId: number;
  producto: string;
  tipo: TipoMovimientoInventario;
  cantidad: number;
  stockAnterior: number;
  stockNuevo: number;
  usuario: string;
}

export interface UsuarioResponsableMovimiento {
  id: string;
  nombre: string;
  email?: string;
}

/* ============================================================
   TIPOS INTERNOS DE SUPABASE
   ============================================================ */

export interface MovimientoInventarioDb {
  id_movimiento: number;
  id_producto: number;
  tipo_movimiento: TipoMovimientoInventario;
  cantidad: number;
  stock_anterior: number;
  stock_nuevo: number;
  referencia_tipo?: string | null;
  referencia_id?: number | null;
  motivo?: string | null;
  fecha_movimiento: string;

  producto?:
    | MovimientoProductoDb
    | MovimientoProductoDb[]
    | null;

  usuario?:
    | MovimientoUsuarioDb
    | MovimientoUsuarioDb[]
    | null;
}

export interface MovimientoProductoDb {
  id_producto?: number;
  codigo_interno?: string | null;
  codigo_barras?: string | null;
  nombre?: string | null;
  stock_actual?: number | null;
  stock_minimo?: number | null;
}

export interface MovimientoUsuarioDb {
  id_usuario?: string;
  nombres?: string | null;
  apellidos?: string | null;
  email?: string | null;
}

export interface RegistrarMovimientoDb {
  id_movimiento?: number;
  id_producto?: number;
  producto?: string;
  tipo_movimiento?: TipoMovimientoInventario;
  cantidad?: number;
  stock_anterior?: number;
  stock_nuevo?: number;
  usuario?: string;
}