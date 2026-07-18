import {
  Component,
  OnInit,
  inject
} from '@angular/core';
import { finalize } from 'rxjs';

import type {
  FiltroProveedor,
  Proveedor,
  ProveedorForm,
  TipoDocumentoProveedor
} from '../../core/models/proveedor.model';

import {
  ProveedorService
} from '../../core/services/proveedor.service';

type ModoFormulario =
  | 'CREAR'
  | 'EDITAR';

@Component({
  selector: 'app-proveedores',
  templateUrl: './proveedores.component.html',
  styleUrls: ['./proveedores.component.css']
})
export class ProveedoresComponent
  implements OnInit {

  private readonly proveedorService =
    inject(ProveedorService);

  proveedores: Proveedor[] = [];
  proveedorSeleccionado:
    Proveedor | null = null;

  buscar = '';
  filtro: FiltroProveedor =
    'TODOS';

  paginaActual = 1;
  readonly elementosPorPagina = 8;

  cargando = false;
  guardando = false;
  error = '';
  mensaje = '';

  mostrarFormulario = false;
  modoFormulario:
    ModoFormulario = 'CREAR';

  form: ProveedorForm =
    this.crearFormularioVacio();

  readonly tiposDocumento:
    TipoDocumentoProveedor[] = [
      'RUC',
      'DNI',
      'CE',
      'OTRO'
    ];

  ngOnInit(): void {
    this.cargar();
  }

  get totalProveedores(): number {
    return this.proveedores.length;
  }

  get totalActivos(): number {
    return this.proveedores.filter(
      proveedor => proveedor.activo
    ).length;
  }

  get conProductosBajoStock(): number {
    return this.proveedores.filter(
      proveedor =>
        proveedor.productosBajoStock > 0
    ).length;
  }

  get nuevosEsteMes(): number {
    const hoy = new Date();

    const prefijo = [
      hoy.getFullYear(),
      String(
        hoy.getMonth() + 1
      ).padStart(2, '0')
    ].join('-');

    return this.proveedores.filter(
      proveedor =>
        String(
          proveedor.creadoEn || ''
        ).startsWith(prefijo)
    ).length;
  }

  get proveedoresFiltrados():
    Proveedor[] {
    const termino =
      this.normalizar(this.buscar);

    return this.proveedores.filter(
      proveedor => {
        if (
          this.filtro === 'ACTIVOS' &&
          !proveedor.activo
        ) {
          return false;
        }

        if (
          this.filtro === 'INACTIVOS' &&
          proveedor.activo
        ) {
          return false;
        }

        if (
          this.filtro ===
            'BAJO_STOCK' &&
          proveedor.productosBajoStock === 0
        ) {
          return false;
        }

        if (
          this.filtro ===
            'SIN_PRODUCTOS' &&
          proveedor.cantidadProductos > 0
        ) {
          return false;
        }

        if (!termino) {
          return true;
        }

        return [
          proveedor.razonSocial,
          proveedor.numeroDocumento,
          proveedor.nombreContacto,
          proveedor.telefono,
          proveedor.correo,
          proveedor.ciudad,
          proveedor.direccion,
          proveedor.categorias.join(' '),
          proveedor.productos
            .map(producto =>
              producto.nombre
            )
            .join(' ')
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
        this.proveedoresFiltrados.length /
        this.elementosPorPagina
      ),
      1
    );
  }

  get proveedoresPaginados():
    Proveedor[] {
    if (
      this.paginaActual >
      this.totalPaginas
    ) {
      this.paginaActual =
        this.totalPaginas;
    }

    const inicio =
      (this.paginaActual - 1) *
      this.elementosPorPagina;

    return this.proveedoresFiltrados.slice(
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

    const desde = Math.max(
      actual - 2,
      1
    );

    const hasta = Math.min(
      desde + 4,
      total
    );

    const inicio = Math.max(
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
      ) => inicio + indice
    );
  }

  cargar(): void {
    this.cargando = true;
    this.error = '';

    this.proveedorService.listar()
      .pipe(
        finalize(() => {
          this.cargando = false;
        })
      )
      .subscribe({
        next: (
          proveedores: Proveedor[]
        ) => {
          this.proveedores =
            proveedores;
          this.paginaActual = 1;

          if (
            this.proveedorSeleccionado
          ) {
            this.proveedorSeleccionado =
              proveedores.find(
                proveedor =>
                  proveedor.id ===
                  this.proveedorSeleccionado?.id
              ) ??
              proveedores[0] ??
              null;
          } else {
            this.proveedorSeleccionado =
              proveedores[0] ??
              null;
          }
        },

        error: (error: unknown) => {
          console.error(
            'Error al cargar proveedores:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudieron cargar los proveedores.';
        }
      });
  }

  abrirNuevoProveedor(): void {
    this.modoFormulario =
      'CREAR';
    this.form =
      this.crearFormularioVacio();
    this.mostrarFormulario =
      true;
    this.error = '';
    this.mensaje = '';
  }

  abrirEditarProveedor(
    proveedor: Proveedor
  ): void {
    this.modoFormulario =
      'EDITAR';

    this.proveedorSeleccionado =
      proveedor;

    this.form = {
      tipoDocumento:
        proveedor.tipoDocumento,
      numeroDocumento:
        proveedor.numeroDocumento,
      razonSocial:
        proveedor.razonSocial,
      nombreContacto:
        proveedor.nombreContacto,
      telefono:
        proveedor.telefono,
      correo:
        proveedor.correo,
      direccion:
        proveedor.direccion,
      ciudad:
        proveedor.ciudad,
      medioPago:
        proveedor.medioPago,
      observaciones:
        proveedor.observaciones,
      activo:
        proveedor.activo
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

  guardar(): void {
    if (this.guardando) {
      return;
    }

    if (
      !this.form.razonSocial.trim()
    ) {
      this.error =
        'Ingresa la razón social.';
      return;
    }

    const documento =
      this.form.numeroDocumento.trim();

    if (
      this.form.tipoDocumento ===
        'RUC' &&
      documento &&
      !/^\d{11}$/.test(documento)
    ) {
      this.error =
        'El RUC debe contener 11 números.';
      return;
    }

    if (
      this.form.tipoDocumento ===
        'DNI' &&
      documento &&
      !/^\d{8}$/.test(documento)
    ) {
      this.error =
        'El DNI debe contener 8 números.';
      return;
    }

    const telefono =
      this.form.telefono.trim();

    if (
      telefono &&
      !/^\d{7,15}$/.test(telefono)
    ) {
      this.error =
        'El teléfono debe contener entre 7 y 15 números.';
      return;
    }

    this.guardando = true;
    this.error = '';

    const operacion =
      this.modoFormulario ===
        'CREAR'
        ? this.proveedorService
            .crear(this.form)
        : this.proveedorService
            .actualizar(
              this.proveedorSeleccionado!.id,
              this.form
            );

    operacion
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: (
          proveedor: Proveedor
        ) => {
          this.proveedorSeleccionado =
            proveedor;

          this.mensaje =
            this.modoFormulario ===
              'CREAR'
              ? 'Proveedor registrado correctamente.'
              : 'Proveedor actualizado correctamente.';

          this.mostrarFormulario =
            false;

          this.cargar();
        },

        error: (error: unknown) => {
          console.error(
            'Error al guardar proveedor:',
            error
          );

          this.error =
            error instanceof Error
              ? error.message
              : 'No se pudo guardar el proveedor.';
        }
      });
  }

  seleccionarProveedor(
    proveedor: Proveedor
  ): void {
    this.proveedorSeleccionado =
      proveedor;
  }

  cambiarEstado(
    proveedor: Proveedor
  ): void {
    if (this.guardando) {
      return;
    }

    this.guardando = true;
    this.error = '';

    this.proveedorService
      .cambiarEstado(
        proveedor.id,
        !proveedor.activo
      )
      .pipe(
        finalize(() => {
          this.guardando = false;
        })
      )
      .subscribe({
        next: () => {
          this.mensaje =
            proveedor.activo
              ? 'Proveedor desactivado correctamente.'
              : 'Proveedor activado correctamente.';

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

    this.paginaActual = pagina;
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
    proveedor: Proveedor
  ): string {
    return proveedor.razonSocial
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map(palabra =>
        palabra[0]?.toUpperCase()
      )
      .join('');
  }

  categoriasProveedor(
    proveedor: Proveedor
  ): string {
    if (
      proveedor.categorias.length === 0
    ) {
      return 'Sin categorías asociadas';
    }

    return proveedor.categorias
      .slice(0, 3)
      .join(', ');
  }

  productosProveedor(
    proveedor: Proveedor
  ): string {
    if (
      proveedor.cantidadProductos === 0
    ) {
      return 'Sin productos';
    }

    return `${proveedor.cantidadProductos} producto(s)`;
  }

  private crearFormularioVacio():
    ProveedorForm {
    return {
      tipoDocumento: 'RUC',
      numeroDocumento: '',
      razonSocial: '',
      nombreContacto: '',
      telefono: '',
      correo: '',
      direccion: '',
      ciudad: '',
      medioPago: '',
      observaciones: '',
      activo: true
    };
  }

  private normalizar(
    valor: string
  ): string {
    return String(valor || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(
        /[\u0300-\u036f]/g,
        ''
      );
  }
}
