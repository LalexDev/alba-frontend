import { Component } from '@angular/core';

interface ClienteLocal {
  nombres: string;
  dni: string;
  telefono: string;
  correo: string;
  direccion: string;
  fecha: string;
  observaciones: string;
}

@Component({
  selector: 'app-clientes-recetas',
  templateUrl: './clientes-recetas.component.html',
  styleUrls: ['./clientes-recetas.component.css']
})
export class ClientesRecetasComponent {
  clientes: ClienteLocal[] = [];
  search = '';
  mostrarFormulario = true;

  cliente: ClienteLocal = {
    nombres: '', dni: '', telefono: '', correo: '', direccion: '', fecha: new Date().toISOString().slice(0, 10), observaciones: ''
  };

  lejos = { esfOD: '', cylOD: '', ejeOD: '', esfOI: '', cylOI: '', ejeOI: '', dip: '' };
  cerca = { esfOD: '', cylOD: '', ejeOD: '', esfOI: '', cylOI: '', ejeOI: '', dip: '' };

  get filtrados(): ClienteLocal[] {
    const q = this.search.toLowerCase();
    return this.clientes.filter(c => !q || [c.nombres, c.dni, c.telefono, c.correo].some(v => v.toLowerCase().includes(q)));
  }

  guardar(): void {
    this.clientes.unshift({ ...this.cliente });
    this.cliente = { nombres: '', dni: '', telefono: '', correo: '', direccion: '', fecha: new Date().toISOString().slice(0, 10), observaciones: '' };
  }

  exportarExcel(): void {
    const rows = this.clientes.map(c => `${c.fecha},${c.nombres},${c.dni},${c.telefono},${c.correo},${c.observaciones}`).join('\n');
    this.descargar('clientes_recetas.csv', 'Fecha,Cliente,DNI,Telefono,Correo,Observaciones\n' + rows, 'text/csv');
  }

  imprimirFicha(): void {
    window.print();
  }

  private descargar(nombre: string, contenido: string, tipo: string): void {
    const blob = new Blob([contenido], { type: tipo });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  }
}
