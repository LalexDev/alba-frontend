export type EstadoCaja =
  'ABIERTA' |
  'CERRADA';

export type TipoMovimientoCaja =
  'INGRESO' |
  'EGRESO';

export type MetodoCaja =
  'EFECTIVO' |
  'YAPE' |
  'TRANSFERENCIA';

export interface CajaResumen {
  cantidadVentas: number;
  totalVendido: number;
  totalCobrado: number;
  saldoPendiente: number;

  efectivo: number;
  yape: number;
  transferencia: number;
  seguro: number;

  seguroPendiente: number;
  segurosCobradosHoy: number;

  pagosExternos: number;
  pagosExternosEfectivo: number;
  pagosExternosYape: number;
  pagosExternosTransferencia: number;

  ingresosManuales: number;
  egresosManuales: number;

  efectivoEsperado: number;
  yapeEsperado: number;

  creditoDsGenerado: number;
  creditoDeyforGenerado: number;
  creditoGeneradoTotal: number;
  creditosCobradosHoy: number;
}

export interface CajaActual {
  abierta: boolean;
  idCaja: number | null;
  idUsuario: string | null;
  usuario: string;
  fechaApertura: string | null;
  montoApertura: number;
  estado: EstadoCaja | null;
  resumen: CajaResumen;
}

export interface CerrarCajaRequest {
  observaciones: string;
}

export interface RegistrarMovimientoCajaRequest {
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
}

export interface RegistrarPagoExternoCajaRequest {
  concepto: string;
  monto: number;
  metodoPago: MetodoCaja;
}

export interface MovimientoCaja {
  idMovimiento: number;
  idCaja: number;
  idVenta: number | null;
  idCuentaManual: number | null;
  tipo: TipoMovimientoCaja;
  concepto: string;
  monto: number;
  fecha: string;
  automatico: boolean;
  pagoExterno: boolean;
  metodoPago: MetodoCaja | null;
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

  yapeEsperado: number;
  yapeConfirmado: number | null;
  diferenciaYape: number | null;

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

  seguroPendiente: number;
  segurosCobradosHoy: number;

  pagosExternos: number;
  pagosExternosEfectivo: number;
  pagosExternosYape: number;
  pagosExternosTransferencia: number;

  ingresosManuales: number;
  egresosManuales: number;
}
