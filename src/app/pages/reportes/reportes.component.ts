import { Component, OnInit } from '@angular/core';
import { ReportesService, DashboardResumen } from '../../core/services/reportes.service';

@Component({ selector: 'app-reportes', templateUrl: './reportes.component.html', styleUrls: ['./reportes.component.css'] })
export class ReportesComponent implements OnInit {
  resumen: DashboardResumen = { totalVentas: 0, bajoStock: 0, cantidadVentas: 0, totalProductos: 0, movimientosInventario: 0 };
  ventasDiarias: any[] = [];
  productosMasVendidos: any[] = [];
  bajoStock: any[] = [];
  error = '';
  constructor(private reportesService: ReportesService) {}
  ngOnInit(): void { this.cargar(); }
  cargar(): void {
    this.reportesService.dashboard().subscribe({ next: d => this.resumen = d, error: () => this.error = 'No se pudo cargar dashboard.' });
    this.reportesService.ventasDiarias().subscribe({ next: d => this.ventasDiarias = d, error: () => {} });
    this.reportesService.productosMasVendidos().subscribe({ next: d => this.productosMasVendidos = d, error: () => {} });
    this.reportesService.bajoStock().subscribe({ next: d => this.bajoStock = d, error: () => {} });
  }
}
