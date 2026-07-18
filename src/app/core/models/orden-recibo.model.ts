export type EstadoOrden =
  | 'PENDIENTE'
  | 'COMPLETADA'
  | 'CANCELADA';

export type TipoDocumentoInterno =
  | 'ORDEN_TRABAJO'
  | 'RECIBO';

export type MetodoPagoOrden =
  | 'EFECTIVO'
  | 'YAPE'
  | 'TRANSFERENCIA';

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
  estado: EstadoOrden;
  observaciones: string;
}

export interface DetalleOrdenItem {
  idDetalle: number;
  idProducto: number;
  codigo: string;
  producto: string;
  modelo: string;
  color: string;
  medida: string;
  material: string;
  marca: string;
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
  tipo: 'TODOS' | TipoDocumentoInterno;
  metodoPago: 'TODOS' | MetodoPagoOrden;
}

export interface ResumenOrdenes {
  total: number;
  completadas: number;
  pendientes: number;
  canceladas: number;
}
