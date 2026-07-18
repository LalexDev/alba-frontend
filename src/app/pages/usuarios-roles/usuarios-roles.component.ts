import {
  Component,
  OnInit,
  inject
} from '@angular/core';
import {
  finalize,
  forkJoin
} from 'rxjs';

import type {
  FiltroUsuario,
  RolSistema,
  RolUsuario,
  UsuarioForm,
  UsuarioSistema
} from '../../core/models/usuario.model';

import {
  UsuarioService
} from '../../core/services/usuario.service';

type ModoFormulario =
  | 'CREAR'
  | 'EDITAR';

@Component({
  selector: 'app-usuarios-roles',
  templateUrl: './usuarios-roles.component.html',
  styleUrls: ['./usuarios-roles.component.css']
})
export class UsuariosRolesComponent
  implements OnInit {

  private readonly usuarioService =
    inject(UsuarioService);

  usuarios: UsuarioSistema[] = [];
  roles: RolUsuario[] = [];

  usuarioSeleccionado:
    UsuarioSistema | null = null;

  authUserIdActual:
    string | null = null;

  buscar = '';
  filtro:
    FiltroUsuario = 'TODOS';

  paginaActual = 1;
  readonly elementosPorPagina = 8;

  cargando = false;
  guardando = false;
  error = '';
  mensaje = '';

  mostrarFormulario = false;
  modoFormulario:
    ModoFormulario = 'CREAR';

  form: UsuarioForm =
    this.crearFormularioVacio();

  ngOnInit(): void {
    this.cargar();
  }

  get totalUsuarios(): number {
    return this.usuarios.length;
  }

  get totalAdministradores(): number {
    return this.usuarios.filter(
      usuario =>
        usuario.rol ===
        'ADMINISTRADOR'
    ).length;
  }

  get totalVendedores(): number {
    return this.usuarios.filter(
      usuario =>
        usuario.rol ===
        'VENDEDOR'
    ).length;
  }

  get totalActivos(): number {
    return this.usuarios.filter(
      usuario =>
        usuario.activo
    ).length;
  }

  get usuariosFiltrados():
    UsuarioSistema[] {
    const termino =
      this.normalizar(
        this.buscar
      );

    return this.usuarios.filter(
      usuario => {
        if (
          this.filtro ===
            'ACTIVOS' &&
          !usuario.activo
        ) {
          return false;
        }

        if (
          this.filtro ===
            'INACTIVOS' &&
          usuario.activo
        ) {
          return false;
        }

        if (
          this.filtro ===
            'ADMINISTRADOR' &&
          usuario.rol !==
            'ADMINISTRADOR'
        ) {
          return false;
        }

        if (
          this.filtro ===
            'VENDEDOR' &&
          usuario.rol !==
            'VENDEDOR'
        ) {
          return false;
        }

        if (!termino) {
          return true;
        }

        return [
          usuario.nombreCompleto,
          usuario.email,
          usuario.telefono,
          usuario.rol
        ].some(valor =>
          this.normalizar(
            valor
          ).includes(termino)
        );
      }
    );
  }

  get totalPaginas(): number {
    return Math.max(
      Math.ceil(
        this.usuariosFiltrados.length /
        this.elementosPorPagina
      ),
      1
    );
  }

  get usuariosPaginados():
    UsuarioSistema[] {
    if (
      this.paginaActual >
      this.totalPaginas
    ) {
      this.paginaActual =
        this.totalPaginas;
    }

    const inicio =
      (
        this.paginaActual - 1
      ) *
      this.elementosPorPagina;

    return this.usuariosFiltrados.slice(
      inicio,
      inicio +
      this.elementosPorPagina
    );
  }

  get paginasVisibles(): number[] {
    const total =
      this.totalPaginas;
    const actual =
      this.paginaActual;

    const desde =
      Math.max(
        actual - 2,
        1
      );

    const hasta =
      Math.min(
        desde + 4,
        total
      );

    const inicio =
      Math.max(
        hasta - 4,
        1
      );

    return Array.from(
      {
        length:
          hasta - inicio + 1
      },
      (
        _,
        indice
      ) =>
        inicio + indice
    );
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    forkJoin({
      usuarios:
        this.usuarioService.listar(),
      roles:
        this.usuarioService.listarRoles(),
      authUserId:
        this.usuarioService
          .obtenerAuthUserIdActual()
    })
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: resultado => {
          this.usuarios =
            resultado.usuarios;
          this.roles =
            resultado.roles;
          this.authUserIdActual =
            resultado.authUserId;

          this.paginaActual = 1;

          if (
            this.usuarioSeleccionado
          ) {
            this.usuarioSeleccionado =
              this.usuarios.find(
                usuario =>
                  usuario.id ===
                  this.usuarioSeleccionado?.id
              ) ??
              this.usuarios[0] ??
              null;
          } else {
            this.usuarioSeleccionado =
              this.usuarios[0] ??
              null;
          }
        },

        error: (error: unknown) => {
          console.error(
            'Error al cargar usuarios:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los usuarios.';
        }
      });
  }

  abrirNuevoUsuario(): void {
    this.modoFormulario =
      'CREAR';

    this.form =
      this.crearFormularioVacio();

    this.mostrarFormulario =
      true;

    this.error = '';
    this.mensaje = '';
  }

  abrirEditarUsuario(
    usuario: UsuarioSistema
  ): void {
    this.usuarioSeleccionado =
      usuario;

    this.modoFormulario =
      'EDITAR';

    this.form = {
      nombres:
        usuario.nombres,
      apellidos:
        usuario.apellidos,
      email:
        usuario.email,
      telefono:
        usuario.telefono,
      rolId:
        usuario.rolId,
      rol:
        usuario.rol,
      activo:
        usuario.activo,
      password: '',
      confirmarPassword: ''
    };

    this.mostrarFormulario =
      true;

    this.error = '';
    this.mensaje = '';
  }

  cerrarFormulario(): void {
    if (this.guardando) {
      return;
    }

    this.mostrarFormulario =
      false;

    this.error = '';
  }

  actualizarRolFormulario(): void {
    const rol =
      this.roles.find(
        item =>
          item.id ===
          Number(this.form.rolId)
      );

    if (rol) {
      this.form.rol =
        rol.nombre;
    }
  }

  guardar(): void {
    if (this.guardando) {
      return;
    }

    const nombres =
      this.form.nombres.trim();

    const email =
      this.form.email
        .trim()
        .toLowerCase();

    if (!nombres) {
      this.error =
        'Ingresa los nombres del usuario.';
      return;
    }

    if (
      !email ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/
        .test(email)
    ) {
      this.error =
        'Ingresa un correo válido.';
      return;
    }

    if (!this.form.rolId) {
      this.error =
        'Selecciona el rol del usuario.';
      return;
    }

    const telefono =
      this.form.telefono.trim();

    if (
      telefono &&
      !/^\d{7,15}$/
        .test(telefono)
    ) {
      this.error =
        'El teléfono debe contener entre 7 y 15 números.';
      return;
    }

    if (
      this.modoFormulario ===
        'CREAR' &&
      this.form.password.length < 8
    ) {
      this.error =
        'La contraseña debe contener al menos 8 caracteres.';
      return;
    }

    if (
      this.form.password &&
      this.form.password.length < 8
    ) {
      this.error =
        'La nueva contraseña debe contener al menos 8 caracteres.';
      return;
    }

    if (
      this.form.password !==
      this.form.confirmarPassword
    ) {
      this.error =
        'Las contraseñas no coinciden.';
      return;
    }

    this.guardando = true;
    this.error = '';

    const modo =
      this.modoFormulario;

    const operacion =
      modo === 'CREAR'
        ? this.usuarioService
            .crear(this.form)
        : this.usuarioService
            .actualizar(
              this.usuarioSeleccionado!.id,
              this.form
            );

    operacion
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: () => {
          this.mensaje =
            modo === 'CREAR'
              ? 'Usuario registrado correctamente.'
              : 'Usuario actualizado correctamente.';

          this.mostrarFormulario =
            false;

          this.cargar();
        },

        error: (error: unknown) => {
          console.error(
            'Error al guardar usuario:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo guardar el usuario.';
        }
      });
  }

  seleccionarUsuario(
    usuario: UsuarioSistema
  ): void {
    this.usuarioSeleccionado =
      usuario;
  }

  puedeCambiarEstado(
    usuario: UsuarioSistema
  ): boolean {
    return Boolean(
      usuario.authUserId &&
      usuario.authUserId !==
        this.authUserIdActual
    );
  }

  cambiarEstado(
    usuario: UsuarioSistema
  ): void {
    if (
      this.guardando ||
      !this.puedeCambiarEstado(
        usuario
      )
    ) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.usuarioService
      .cambiarEstado(
        usuario.id,
        !usuario.activo
      )
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: () => {
          this.mensaje =
            usuario.activo
              ? 'Usuario desactivado correctamente.'
              : 'Usuario activado correctamente.';

          this.cargar();
        },

        error: (error: unknown) => {
          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo cambiar el estado.';
        }
      });
  }

  limpiarFiltros(): void {
    this.buscar = '';
    this.filtro = 'TODOS';
    this.paginaActual = 1;
  }

  irPagina(
    pagina: number
  ): void {
    if (
      pagina < 1 ||
      pagina > this.totalPaginas
    ) {
      return;
    }

    this.paginaActual =
      pagina;
  }

  paginaAnterior(): void {
    this.irPagina(
      this.paginaActual - 1
    );
  }

  paginaSiguiente(): void {
    this.irPagina(
      this.paginaActual + 1
    );
  }

  iniciales(
    usuario: UsuarioSistema
  ): string {
    return usuario.nombreCompleto
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(palabra =>
        palabra[0]
          ?.toUpperCase()
      )
      .join('');
  }

  textoRol(
    rol: RolSistema
  ): string {
    return rol ===
      'ADMINISTRADOR'
      ? 'Administrador'
      : 'Vendedor';
  }

  esCuentaActual(
    usuario: UsuarioSistema
  ): boolean {
    return Boolean(
      usuario.authUserId &&
      usuario.authUserId ===
        this.authUserIdActual
    );
  }

  private crearFormularioVacio():
    UsuarioForm {
    const rolVendedor =
      this.roles.find(
        rol =>
          rol.nombre ===
          'VENDEDOR'
      );

    return {
      nombres: '',
      apellidos: '',
      email: '',
      telefono: '',
      rolId:
        rolVendedor?.id ??
        null,
      rol: 'VENDEDOR',
      activo: true,
      password: '',
      confirmarPassword: ''
    };
  }

  private normalizar(
    valor: string
  ): string {
    return String(
      valor || ''
    )
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      );
  }
}
