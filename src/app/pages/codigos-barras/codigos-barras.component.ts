import { Component, OnInit } from '@angular/core';
import { Producto } from '../../core/models/producto.model';
import { ProductoService } from '../../core/services/producto.service';

@Component({ selector: 'app-codigos-barras', templateUrl: './codigos-barras.component.html', styleUrls: ['./codigos-barras.component.css'] })
export class CodigosBarrasComponent implements OnInit {
  productos: Producto[] = [];
  constructor(private productoService: ProductoService) {}
  ngOnInit(): void { this.productoService.listar().subscribe({ next: d => this.productos = d, error: () => {} }); }
  imprimir(): void { window.print(); }
}
