import { Component } from '@angular/core';

@Component({ selector: 'app-movimientos-inventario', templateUrl: './movimientos-inventario.component.html', styleUrls: ['./movimientos-inventario.component.css'] })
export class MovimientosInventarioComponent {
  movimientos: any[] = [];
  nuevo = { producto: '', tipo: 'ENTRADA_COMPRA', cantidad: 1, motivo: 'Compra o reposición' };
  guardar(): void { this.movimientos.unshift({ ...this.nuevo, fecha: new Date() }); }
}
