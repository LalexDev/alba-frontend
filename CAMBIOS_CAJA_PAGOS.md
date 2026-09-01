# Caja y pagos institucionales

## Instalación

Antes de publicar el frontend, ejecuta en Supabase SQL Editor:

```text
supabase/migrations/49_cierre_automatico_pagos_institucionales.sql
supabase/migrations/50_cuentas_manuales.sql
```

Ejecuta los archivos en ese orden y una sola vez.

Después vuelve a compilar o publicar la aplicación Angular.

## Reglas implementadas

- El cierre de caja es automático y usa los movimientos registrados.
- Efectivo, Yape y transferencia se totalizan por separado.
- Seguro queda pendiente al registrar la venta.
- Crédito DS/Deyfor queda pendiente al registrar la venta.
- Seguro y Crédito solo aceptan la cancelación completa del saldo.
- La cancelación mensual entra en la caja abierta usando el medio realmente recibido.
- Las ventas antiguas realizadas en documentos físicos se administran desde
  **Cuentas manuales**.
- Cada ficha conserva cliente, teléfono, boleta u orden, fecha, montura,
  precio de la montura, total, cancelado y saldo.
- El monto marcado como cancelado anteriormente es histórico y no altera la
  caja actual.
- El campo **Pago recibido hoy** y los cobros posteriores ingresan a la caja
  abierta con su medio real: Efectivo, Yape o transferencia.
- Las cuentas manuales no crean ventas ni movimientos de inventario.
- Los egresos manuales continúan descontándose del efectivo esperado.

## Verificación recomendada

1. Abrir una caja.
2. Registrar una venta en efectivo, una por Yape y una por transferencia.
3. Registrar una venta por Seguro y confirmar que queda pendiente.
4. Registrar un Crédito DS o Deyfor y confirmar que queda pendiente.
5. Cancelar Seguro y Crédito por el saldo completo.
6. Crear una cuenta manual con monto histórico y saldo pendiente.
7. Registrar un pago desde Cuentas manuales y confirmar que aparece en Caja.
8. Verificar que la cuenta actualiza cancelado y saldo sin tocar inventario.
9. Cerrar la caja y verificar que no se solicitan montos manuales.

La migración no cambia automáticamente la situación de seguros históricos que ya
estaban registrados como pagados. Esa corrección debe revisarse caso por caso para
no borrar cobros reales.
