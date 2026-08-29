import { Producto } from './producto.model';

export type EntidadCreditoVenta =
  | 'DS'
  | 'DEYFOR';

export interface DatosCreditoVenta {
  entidad: EntidadCreditoVenta;
  proyecto: string;
  medidas: string;
  montura: string;
}

export type TipoObsequioVenta =
  | 'MICROFIBRA'
  | 'ESTUCHE';

export interface ItemVenta {
  producto: Producto;
  cantidad: number;
  subtotal: number;

  /**
   * Identificador único de la fila del carrito.
   * Permite vender un estuche y, al mismo tiempo,
   * agregar otro estuche como obsequio.
   */
  idLinea?: string;

  /**
   * Cuando es true, el producto descuenta stock,
   * pero su precio final es S/ 0.00.
   */
  esObsequio?: boolean;

  tipoObsequio?: TipoObsequioVenta;

  /**
   * Línea digitada durante la venta, por ejemplo:
   * lunas, reparación, plaquetas o mano de obra.
   * No modifica inventario.
   */
  esManual?: boolean;
  descripcionManual?: string;
  precioManual?: number;
}

export interface VentaRegistrada {
  idVenta: number;
  numeroVenta: string;
  total: number;
  aCuenta: number;
  saldo: number;
  estadoPago:
    | 'PENDIENTE'
    | 'PARCIAL'
    | 'PAGADO';
}

export interface VentaListado {
  id: number;
  numeroVenta: string;
  fechaVenta: string;

  cliente: string;
  vendedor: string;

  total: number;
  aCuenta: number;
  saldo: number;

  metodoPago: string;
  estadoPago: string;
  estadoVenta: string;

  entidadCredito?: EntidadCreditoVenta | null;
  proyectoCredito?: string;
  medidasCredito?: string;
  monturaCredito?: string;

  observaciones?: string;
}
