import { Producto } from './producto.model';

export interface ItemVenta {
  producto: Producto;
  cantidad: number;
  subtotal: number;
}

export interface VentaRegistrada {
  idVenta: number;
  numeroVenta: string;
  total: number;
  aCuenta: number;
  saldo: number;
  estadoPago: 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
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