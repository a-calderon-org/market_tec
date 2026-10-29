# Contratos de diseño de MarketTec

**Estado:** Borradores versionables pendientes de aprobación del equipo
**Fecha de consolidación:** 2026-10-29

Este directorio contiene los acuerdos mínimos para que `ms-users`, `ms-catalog` y
`ms-notifications` puedan evolucionar en paralelo. Los archivos describen diseño;
no demuestran que una ruta o integración esté implementada.

## Estructura

- `identity/IDENTITY_CONTRACT.md`: identidad interna, JWT recomendado y frontera de confianza.
- `openapi/*.json`: OpenAPI 3.1 de diseño por microservicio.
- `events/*.schema.json`: JSON Schema Draft 2020-12 para eventos asíncronos.
- `examples/events/`: ejemplos válidos e inválidos usados por las pruebas.
- `tests/test_contracts.py`: ocho pruebas de compatibilidad y semántica sin
  dependencias externas.
- `tests/test_formal_validation.py`: validación formal de JSON Schema Draft
  2020-12 mediante `jsonschema`.

Cada operación OpenAPI declara `x-implementation-status`:

- `implemented`: existe en el código actual.
- `proposed`: contrato de diseño; no existe todavía en el servicio.

El nivel superior declara `x-contract-status: draft-pending-team-approval`. La
creación de estos archivos no aprueba ADR-003 ni las decisiones pendientes sobre
el modelo de seguridad. ADR-001 ya fue aceptado de forma separada.

## Compatibilidad inicial

La primera integración conserva las formas ya consumidas por Angular:

- paginación plana con `items`, `totalRecords`, `page` y `pageSize`;
- `fechaPublicacion`, `fechaRegistro` y `fecha` como strings en las rutas existentes;
- `sortDirection` como nombre canónico para el filtro nuevo;
- identificadores numéricos de vendedor donde Angular todavía los tipa así.

Los campos Epoch seconds nuevos usan nombres distintos (`createdAt`, `occurredAt`,
`sentAt`, `expiresAt`) y nunca cambian silenciosamente el tipo de un campo
existente. Retirar los campos de compatibilidad o cambiar IDs requiere una nueva
versión y una actualización coordinada de Angular.

## Validación local

Las herramientas son dependencias de desarrollo aisladas de los microservicios:
Redocly CLI `2.71.2` queda bloqueado por `package-lock.json` y las dependencias de
`jsonschema` están fijadas en `requirements-validation.txt`.

```bash
npm ci --prefix contracts
python3 -m venv contracts/.venv
source contracts/.venv/bin/activate
python -m pip install -r contracts/requirements-validation.txt
npm --prefix contracts exec -- redocly lint \
  contracts/openapi/users.json \
  contracts/openapi/catalog.json \
  contracts/openapi/notifications.json
python -m unittest discover -s contracts/tests -p 'test_*.py' -v
```

Redocly valida sintaxis, estructura, referencias, parámetros, respuestas,
componentes y seguridad declarada de los tres OpenAPI 3.1. La suite ejecuta las
ocho pruebas existentes y cuatro adicionales: metaschema Draft 2020-12,
resolución de referencias, ejemplo positivo y ejemplos negativos. La desigualdad
entre `senderUserId` y `recipientUserId` es una regla entre campos no expresada por
JSON Schema; permanece cubierta por la prueba semántica existente.

Las advertencias `info-license` y `operation-4xx-response` sobre los endpoints de
salud son de estilo y no invalidan los contratos. Los errores estructurales sí
producen un código de salida distinto de cero.
