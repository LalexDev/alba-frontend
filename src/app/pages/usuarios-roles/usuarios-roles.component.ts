import { Component } from '@angular/core';

@Component({ selector: 'app-usuarios-roles', templateUrl: './usuarios-roles.component.html', styleUrls: ['./usuarios-roles.component.css'] })
export class UsuariosRolesComponent {
  usuarios = [{ nombres: 'Melina', correo: 'opticaalba@gmail.com', rol: 'ADMINISTRADOR', estado: 'ACTIVO' }];
}
