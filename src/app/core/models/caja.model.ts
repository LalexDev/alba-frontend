export type EstadoCaja = 'ABIERTA' | 'CERRADA';
export type TipoMovimientoCaja = 'INGRESO' | 'EGRESO';

export interface ResumenCaja {
  cantidadVentas: number;
  totalVendido: number;
  totalCobrado: number;
  saldoPendiente: number;
  efectivo: number;
  yape: number;
  transferencia: number;
  seguro: number;
  ingresosManuales: number;
  egresosManuales: number;
  efectivoEsperado: number;
}

export interface CajaActual {
  abierta: boolean;
  idCaja: number | null;
  idUsuario: string | null;
  usuario: string;
  fechaApertura: string | null;
  montoApertura: number;
  estado: EstadoCaja | null;
  resumen: ResumenCaja;
}

export interface MovimientoCaja {
  idMovimiento: number;
  idCaja: number;
  idVenta: number | null;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  fecha: string;
  automatico: boolean;
}

export interface CajaHistorial {
  idCaja: number;
  idUsuario: string;
  usuario: string;
  fechaApertura: string;
  fechaCierre: string | null;
  montoApertura: number;
  montoEsperado: number;
  montoCierreReal: number | null;
  diferencia: number | null;
  estado: EstadoCaja;
  observaciones: string;
  cantidadVentas: number;
  totalVendido: number;
  totalCobrado: number;
  saldoPendiente: number;
  efectivo: number;
  yape: number;
  transferencia: number;
  seguro: number;
  ingresosManuales: number;
  egresosManuales: number;
}

export interface CerrarCajaRequest {
  montoCierreReal: number;
  observaciones?: string;
}

export interface RegistrarMovimientoCajaRequest {
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
}
