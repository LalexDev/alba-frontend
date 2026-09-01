import type { MetodoCaja } from './caja.model';

export type EstadoCuentaManual =
  | 'PENDIENTE'
  | 'PAGADA';

export type FiltroEstadoCuentaManual =
  | 'TODAS'
  | EstadoCuentaManual;

export interface CuentaManual {
  idCuenta: number;
  idUsuario: string;
  usuario: string;
  clienteNombre: string;
  clienteTelefono: string;
  referencia: string;
  fechaVenta: string;
  montura: string;
  precioVenta: number;
  totalVenta: number;
  montoCanceladoHistorico: number;
  cobrosSistema: number;
  montoCancelado: number;
  saldoPendiente: number;
  estado: EstadoCuentaManual;
  observaciones: string;
  creadoEn: string;
  actualizadoEn: string;
  ultimoPagoEn: string | null;
}

export interface CuentaManualForm {
  clienteNombre: string;
  clienteTelefono: string;
  referencia: string;
  fechaVenta: string;
  montura: string;
  precioVenta: number | null;
  totalVenta: number | null;
  montoCanceladoHistorico: number | null;
  pagoRecibidoHoy: number | null;
  metodoPagoHoy: MetodoCaja;
  observaciones: string;
}

export interface RegistrarPagoCuentaManualRequest {
  idCuenta: number;
  monto: number;
  metodoPago: MetodoCaja;
  observaciones: string;
}

export interface PagoCuentaManual {
  idPago: number;
  idCuenta: number;
  idCaja: number;
  idUsuario: string;
  usuario: string;
  monto: number;
  metodoPago: MetodoCaja;
  fechaPago: string;
  observaciones: string;
}
