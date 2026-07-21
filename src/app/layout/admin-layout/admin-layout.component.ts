import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { TokenService } from '../../core/services/token.service';

interface NavItem {
  label: string;
  icon: string;
  path: string;
  roles: string[];
}

interface PageTitle {
  label: string;
  icon: string;
}

@Component({
  selector: 'app-admin-layout',
  templateUrl: './admin-layout.component.html',
  styleUrls: ['./admin-layout.component.css']
})
export class AdminLayoutComponent implements OnInit {

  sidebarOpen = false;
  role = '';
  userLabel = 'Usuario';

  navItems: NavItem[] = [];

  constructor(
    private tokenService: TokenService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.role = this.tokenService.getRole() || '';
    this.userLabel = this.obtenerNombreUsuario();
    this.cargarMenu();
  }

  private cargarMenu(): void {
    this.navItems = [
      {
        label: 'Dashboard',
        icon: 'bi bi-speedometer2',
        path: '/admin/dashboard',
        roles: ['ADMINISTRADOR']
      },
      {
        label: 'Ventas / Escáner',
        icon: 'bi bi-upc-scan',
        path:
          this.role === 'VENDEDOR'
            ? '/vendedor/ventas'
            : '/admin/ventas',
        roles: ['ADMINISTRADOR', 'VENDEDOR']
      },
      {
        label: 'Productos e inventario',
        icon: 'bi bi-box-seam',
        path:
          this.role === 'VENDEDOR'
            ? '/vendedor/productos'
            : '/admin/productos',
        roles: ['ADMINISTRADOR', 'VENDEDOR']
      },
      {
        label: 'Clientes y recetas',
        icon: 'bi bi-person-vcard',
        path:
          this.role === 'VENDEDOR'
            ? '/vendedor/clientes'
            : '/admin/clientes',
        roles: ['ADMINISTRADOR', 'VENDEDOR']
      },
      {
        label: 'Órdenes y recibos',
        icon: 'bi bi-receipt',
        path:
          this.role === 'VENDEDOR'
            ? '/vendedor/ordenes'
            : '/admin/ordenes',
        roles: ['ADMINISTRADOR', 'VENDEDOR']
      },
      {
        label: 'Proveedores',
        icon: 'bi bi-truck',
        path: '/admin/proveedores',
        roles: ['ADMINISTRADOR']
      },
      {
        label: 'Movimientos de inventario',
        icon: 'bi bi-arrow-repeat',
        path: '/admin/movimientos',
        roles: ['ADMINISTRADOR']
      },
      {
        label: 'Usuarios y roles',
        icon: 'bi bi-people',
        path: '/admin/usuarios',
        roles: ['ADMINISTRADOR']
      },
      {
        label: 'Reportes',
        icon: 'bi bi-bar-chart-line',
        path: '/admin/reportes',
        roles: ['ADMINISTRADOR']
      }
    ];
  }

  get visibleItems(): NavItem[] {
    return this.navItems.filter((item) =>
      item.roles.includes(this.role)
    );
  }

  get pageTitle(): PageTitle {
    const currentUrl = this.router.url
      .split('?')[0]
      .split('#')[0];

    const currentItem = this.navItems.find((item) =>
      currentUrl.startsWith(item.path)
    );

    if (currentItem) {
      return {
        label: currentItem.label,
        icon: currentItem.icon
      };
    }

    return {
      label: 'Sistema de Óptica',
      icon: 'bi bi-eyeglasses'
    };
  }

  /**
   * Oculta la cabecera superior únicamente en el Dashboard.
   */
  get mostrarTopbar(): boolean {
    const currentUrl = this.router.url
      .split('?')[0]
      .split('#')[0];

    return currentUrl !== '/admin/dashboard';
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  quickScanner(): void {
    const route =
      this.role === 'VENDEDOR'
        ? '/vendedor/ventas'
        : '/admin/ventas';

    this.closeSidebar();
    this.router.navigate([route]);
  }

  logout(): void {
    this.tokenService.clear();
    this.closeSidebar();
    this.router.navigate(['/login']);
  }

  private obtenerNombreUsuario(): string {
    const nombre =
      localStorage.getItem('nombreCompleto') ||
      localStorage.getItem('userLabel') ||
      localStorage.getItem('nombreUsuario');

    if (nombre) {
      return nombre;
    }

    return this.role === 'ADMINISTRADOR'
      ? 'Administrador'
      : 'Vendedor';
  }
}