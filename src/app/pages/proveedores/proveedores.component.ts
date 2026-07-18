import { Component } from '@angular/core';

@Component({ selector: 'app-proveedores', templateUrl: './proveedores.component.html', styleUrls: ['./proveedores.component.css'] })
export class ProveedoresComponent {
  proveedores: any[] = [];
  nuevo: any = { razonSocial: '', ruc: '', telefono: '', correo: '', direccion: '', contacto: '' };
  guardar(): void { this.proveedores.unshift({ ...this.nuevo }); this.nuevo = { razonSocial: '', ruc: '', telefono: '', correo: '', direccion: '', contacto: '' }; }
}
