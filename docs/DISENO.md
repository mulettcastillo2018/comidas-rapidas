# Sistema de diseño

Rediseño visual de 2026: misma funcionalidad, apariencia limpia y de alta gama. Todo se construye con
clases utilitarias de Tailwind 4 sobre unos pocos tokens; no hay hojas de estilo por pantalla.

La guía viva está en `/diseno` (muestra cada token y componente en los dos temas).

## Temas

| Tema | Dónde | Por qué |
| --- | --- | --- |
| Claro (por defecto) | Mesero, administración, carta QR, seguimiento | Se lee bien de día, en celulares al sol y al imprimir |
| Oscuro profundo (`data-tema="oscuro"`) | Cocina y pantalla del salón | Tableros en TV o tablet: cansa menos y los estados resaltan |

Los tokens viven en `frontend/src/app/globals.css`. El tema oscuro solo cambia sus valores: las mismas clases
(`bg-surface`, `text-muted-foreground`...) funcionan en los dos. La variante `dark:` existe para los pocos
ajustes que no son de color.

## Tokens

- **Superficies:** `background` (fondo cálido), `surface` (tarjetas), `surface-2` (rellenos suaves), `border` y `border-strong`.
- **Texto:** `foreground` y `muted-foreground`.
- **Marca:** `accent` (brasa) para la acción principal y `accent-2` (ámbar) solo para resaltar.
- **Estados:** `exito`, `aviso`, `peligro` e `info`, con su versión suave por opacidad (`bg-exito/10`). Un estado siempre lleva texto o ícono: el color solo lo refuerza.
- **Sombras:** `shadow-suave` (reposo), `shadow-elevada` (hover y paneles), `shadow-flotante` (menús y diálogos) y `shadow-acento` (botón principal).
- **Movimiento:** `ease-resorte` (lo que se toca: leve rebote), `ease-salida` (lo que aparece) y las animaciones `animate-aparecer`, `animate-emerger` y `animate-brillo`. Con "reducir movimiento" activado en el sistema, todo queda instantáneo.
- **Tipografía:** Geist (sans) y Geist Mono. Las cifras van con `tabular-nums` para que precios y tiempos no bailen.

## Reglas

- **Radios:** controles `rounded-xl`, tarjetas `rounded-2xl`, bloques grandes `rounded-3xl`, estados y pastillas `rounded-full`.
- **Espaciado:** escala de 4 px de Tailwind. Las páginas usan `Contenedor` (márgenes que crecen con la pantalla) y el contenido se separa con `gap`, no con márgenes sueltos.
- **Una acción principal por bloque:** el botón `primario` usa el color de marca; el resto, `secundario` o `fantasma`.
- **Vidrio esmerilado** solo para lo que flota sobre el contenido (barra superior, paneles fijos), no para tarjetas comunes.
- **Foco visible** en todo control (anillo del color de marca) y objetivos táctiles de al menos 40 px en las pantallas de servicio.

## Componentes base (`frontend/src/components/ui`)

| Componente | Uso |
| --- | --- |
| `Boton` / `estilosBoton()` | Variantes `primario`, `secundario`, `fantasma`, `peligro`, `exito`; tamaños `sm`, `md`, `lg`; `cargando` muestra un indicador. `estilosBoton()` da las mismas clases a un `Link` |
| `Tarjeta` / `CabeceraTarjeta` | Superficie base; `interactiva` se levanta al pasar el mouse; `vidrio` para paneles flotantes |
| `Campo`, `Entrada`, `Selector`, `AreaTexto` | Campo con etiqueta, ayuda o error enlazados por id (accesibles) |
| `Insignia` / `PuntoVivo` | Estados cortos con tono semántico; punto con pulso para "en vivo" |
| `EncabezadoPagina` / `Contenedor` | Título de pantalla con acciones; ancho y márgenes de página |
| `Esqueleto` | Marcador de carga |
| `Segmentado` | Pestañas en control segmentado; en pantallas angostas se desplaza en vez de partir el texto |
| `cx` | Une clases y resuelve choques con tailwind-merge (conoce los tokens propios): la última clase gana |

## Avance por secciones

El rediseño se aplicó sección por sección, cada una en su propio commit y revisada con capturas en
celular, tableta, escritorio y TV:

1. Fundamentos: tokens, tipografía, componentes base y guía viva (`/diseno`).
2. Marco: barra superior de vidrio con menú móvil, inicio en grilla bento y acceso.
3. Mesero: mesas y detalle de mesa en dos columnas.
4. Cocina en tema oscuro (el tema se aplica por ruta antes de pintar: `TemaPorRuta`).
5. Pantalla del salón en oscuro, pensada para TV.
6. Páginas públicas: carta QR, seguimiento y encuesta.
7. Administración: barra lateral agrupada y pasada de estilos en todas las pantallas.

## Notas para seguir

- Los campos que todavía no usan `<Entrada>`/`<Selector>` toman fondo, borde al pasar el mouse y anillo de
  foco desde la capa base de `globals.css` (selector `:where(...)[class*="border-border"]`, sin especificidad).
- La clase `.btn-primary` sigue en las pantallas de administración y ya usa los tokens; en código nuevo se
  prefiere `<Boton>`.
- Funcionalidad intacta: las pruebas del frontend pasan y un recorrido con clics reales (pedido, cocina,
  entrega, cuenta y cobro) se verificó en una sede temporal que luego se borra.
