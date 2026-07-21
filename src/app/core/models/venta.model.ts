import { Producto } from './producto.model';

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

  observaciones?: string;
}
