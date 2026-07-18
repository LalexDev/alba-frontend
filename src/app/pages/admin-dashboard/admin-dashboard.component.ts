import { Component, OnInit } from '@angular/core';
import { finalize, forkJoin } from 'rxjs';

import {
  DashboardResumen,
  ReportesService
} from '../../core/services/reportes.service';

interface VentaReciente {
  id_venta: number;
  numero_venta: string;
  fecha_venta: string;
  total: number;
  metodo_pago: string;
  estado_venta: string;
}

interface ProductoMasVendido {
  idProducto: number;
  codigoInterno: string;
  nombre: string;
  cantidadVendida: number;
  totalVendido: number;
}

@Component({
  selector: 'app-admin-dashboard',
  templateUrl: './admin-dashboard.component.html',
  styleUrls: ['./admin-dashboard.component.css']
})
export class AdminDashboardComponent implements OnInit {

  resumen: DashboardResumen = {
    totalVentas: 0,
    bajoStock: 0,
    cantidadVentas: 0,
    totalProductos: 0,
    movimientosInventario: 0
  };

  ultimasVentas: VentaReciente[] = [];
  productosMasVendidos: ProductoMasVendido[] = [];

  loading = false;
  error = '';

  fechaActual = new Date();

  constructor(
    private reportesService: ReportesService
  ) {}

  ngOnInit(): void {
    this.cargarDashboard();
  }

  cargarDashboard(): void {
    if (this.loading) {
      return;
    }

    this.loading = true;
    this.error = '';

    forkJoin({
      resumen: this.reportesService.dashboard(),
      ventas: this.reportesService.ventasDiarias(),
      productos: this.reportesService.productosMasVendidos()
    })
      .pipe(
        finalize(() => {
          this.loading = false;
        })
      )
      .subscribe({
        next: ({ resumen, ventas, productos }) => {
          this.resumen = resumen;

          this.ultimasVentas = (ventas ?? [])
            .slice(0, 5) as VentaReciente[];

          this.productosMasVendidos = (productos ?? [])
            .slice(0, 5) as ProductoMasVendido[];
        },

        error: (error) => {
          console.error(
            'Error al cargar dashboard:',
            error
          );

          this.error =
            error?.message ||
            'No se pudo cargar la información del dashboard.';
        }
      });
  }

  porcentajeProducto(
    cantidad: number
  ): number {
    const maximo = Math.max(
      ...this.productosMasVendidos.map(
        producto => Number(producto.cantidadVendida)
      ),
      1
    );

    return Math.max(
      8,
      Math.round(
        Number(cantidad) * 100 / maximo
      )
    );
  }

  etiquetaMetodoPago(
    metodo: string
  ): string {
    switch (
      String(metodo).toUpperCase()
    ) {
      case 'YAPE':
        return 'Yape';

      case 'TRANSFERENCIA':
        return 'Transferencia';

      default:
        return 'Efectivo';
    }
  }
}