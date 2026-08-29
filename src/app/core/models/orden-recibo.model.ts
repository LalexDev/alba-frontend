export type EstadoOrden =
  | 'PENDIENTE'
  | 'COMPLETADA'
  | 'CANCELADA';

export type EstadoPagoOrden =
  | 'PENDIENTE'
  | 'PARCIAL'
  | 'PAGADO';

export type TipoDocumentoInterno =
  | 'ORDEN_TRABAJO'
  | 'RECIBO';

export type MetodoPagoOrden =
  | 'EFECTIVO'
  | 'YAPE'
  | 'TRANSFERENCIA'
  | 'SEGURO'
  | 'CREDITO';

export type EntidadCreditoOrden =
  | 'DS'
  | 'DEYFOR';

export type MetodoCobroCredito =
  | 'EFECTIVO'
  | 'YAPE'
  | 'TRANSFERENCIA';

export type MetodoPagoAbonoOrden =
  | 'EFECTIVO'
  | 'YAPE'
  | 'TRANSFERENCIA'
  | 'SEGURO';

export interface OrdenRecibo {
  idVenta: number;
  numeroOrden: string;
  idCliente: number | null;
  cliente: string;
  telefono: string;
  documento: string;
  fechaVenta: string;
  fechaEntrega?: string | null;
  tipo: TipoDocumentoInterno;
  total: number;
  montoCancelado: number;
  saldo: number;
  metodoPago: MetodoPagoOrden;

  entidadCredito?:
    EntidadCreditoOrden | null;

  proyectoCredito?: string;
  medidasCredito?: string;
  monturaCredito?: string;

  estadoPago: EstadoPagoOrden;
  estado: EstadoOrden;
  observaciones: string;
}

export interface DetalleOrdenItem {
  idDetalle: number;
  idProducto: number | null;
  codigo: string;
  producto: string;
  esManual?: boolean;
  modelo: string;
  color: string;
  medida: string;
  material: string;
  marca: string;
  categoria?: string;
  cantidad: number;
  precioUnitario: number;
  descuento: number;
  subtotal: number;
}

export interface OrdenReciboDetalle
  extends OrdenRecibo {
  items: DetalleOrdenItem[];
}

export interface FiltrosOrdenes {
  buscar: string;
  desde: string;
  hasta: string;
  estado: 'TODOS' | EstadoOrden;
  estadoPago: 'TODOS' | EstadoPagoOrden;
  tipo: 'TODOS' | TipoDocumentoInterno;
  metodoPago: 'TODOS' | MetodoPagoOrden;
}

export interface ResumenOrdenes {
  total: number;
  completadas: number;
  pendientes: number;
  canceladas: number;
}


export interface RevisionPagoEstadoRequest {
  idVenta: number;
  estadoOrden: EstadoOrden;
  pagoAdicional: number;
  metodoPagoAdicional:
    MetodoPagoAbonoOrden;
  pagoRevisado: boolean;
}

export interface RevisionPagoEstadoResultado {
  idVenta: number;
  total: number;
  montoCancelado: number;
  saldo: number;
  estadoPago: EstadoPagoOrden;
  estadoOrden: EstadoOrden;

  metodoPagoAdicional?:
    MetodoPagoAbonoOrden | null;

  idCajaPago?: number | null;
  fechaPago?: string | null;
}


export interface PagoCreditoRequest {
  idVenta: number;
  metodoCobro: MetodoCobroCredito;
  monto: number;
}

export interface PagoCreditoResultado {
  idVenta: number;
  montoPagado: number;
  saldo: number;
  estadoPago: EstadoPagoOrden;
}


/* ============================================================
   CAMBIO DE MONTURA
   ============================================================ */

export interface MonturaCambioOption {
  idProducto: number;
  codigoInterno: string;
  codigoBarras: string;
  nombre: string;
  marca: string;
  modelo: string;
  color: string;
  medida: string;
  stockActual: number;
}

export interface CambioMonturaRequest {
  idVenta: number;
  idDetalleVenta: number;
  idProductoNuevo: number;
  motivo?: string;
}

export interface CambioMonturaResultado {
  idVenta: number;
  idDetalleVenta: number;
  idProductoAnterior: number;
  idProductoNuevo: number;
  cantidad: number;
  stockAnteriorDevuelto: number;
  stockNuevoRestante: number;
  monturaAnterior: string;
  monturaNueva: string;
}
