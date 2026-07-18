export type TipoDocumentoCliente =
  | 'DNI'
  | 'RUC'
  | 'CE'
  | 'PASAPORTE'
  | 'SIN_DOCUMENTO';

export interface RecetaOptica {
  id: number;
  clienteId: number;

  numeroOrden: string;
  fechaEntrada: string;
  montoCancelado: number;
  montoDebe: number;
  montoTotal: number;
  medida?: string;
  marca?: string;

  fechaReceta: string;
  profesional?: string;

  lejosOdEsfera?: number | null;
  lejosOdCilindro?: number | null;
  lejosOdEje?: number | null;
  lejosOiEsfera?: number | null;
  lejosOiCilindro?: number | null;
  lejosOiEje?: number | null;
  lejosDip?: number | null;

  cercaOdEsfera?: number | null;
  cercaOdCilindro?: number | null;
  cercaOdEje?: number | null;
  cercaOiEsfera?: number | null;
  cercaOiCilindro?: number | null;
  cercaOiEje?: number | null;
  cercaDip?: number | null;

  adicionOd?: number | null;
  adicionOi?: number | null;
  agudezaVisualOd?: string;
  agudezaVisualOi?: string;
  tipoLente?: string;
  tipoMontura?: string;
  diagnostico?: string;
  observaciones?: string;
  proximoControl?: string | null;
  vigente: boolean;
  creadoEn?: string;
}

export interface Cliente {
  id: number;
  tipoDocumento: TipoDocumentoCliente;
  numeroDocumento?: string;
  nombres: string;
  apellidos: string;
  nombreCompleto: string;
  telefono?: string;
  correo?: string;
  direccion?: string;
  fechaNacimiento?: string | null;
  observaciones?: string;
  activo: boolean;
  creadoEn?: string;
  actualizadoEn?: string;
  recetas: RecetaOptica[];
  ultimaReceta?: RecetaOptica;
}

export interface RecetaForm {
  numeroOrden: string;
  fechaEntrada: string;
  montoCancelado: string | number | null;
  montoDebe: string | number | null;
  montoTotal: string | number | null;
  medida: string;
  marca: string;

  fechaReceta: string;
  profesional: string;

  lejosOdEsfera: string | number | null;
  lejosOdCilindro: string | number | null;
  lejosOdEje: string | number | null;
  lejosOiEsfera: string | number | null;
  lejosOiCilindro: string | number | null;
  lejosOiEje: string | number | null;
  lejosDip: string | number | null;

  cercaOdEsfera: string | number | null;
  cercaOdCilindro: string | number | null;
  cercaOdEje: string | number | null;
  cercaOiEsfera: string | number | null;
  cercaOiCilindro: string | number | null;
  cercaOiEje: string | number | null;
  cercaDip: string | number | null;

  adicionOd: string | number | null;
  adicionOi: string | number | null;
  agudezaVisualOd: string;
  agudezaVisualOi: string;
  tipoLente: string;
  tipoMontura: string;
  diagnostico: string;
  observaciones: string;
  proximoControl: string;
  vigente: boolean;
}

export interface ClienteForm {
  tipoDocumento: TipoDocumentoCliente;
  numeroDocumento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  direccion: string;
  fechaNacimiento: string;
  observaciones: string;
  incluirReceta: boolean;
  receta: RecetaForm;
}

export interface RecetaExcelImport {
  numeroOrden: string;
  cliente: string;
  documento: string;
  fechaEntrada: string;
  montoCancelado: number;
  montoDebe: number;
  montoTotal: number;
  medida: string;
  montura: string;
  marca: string;
}
