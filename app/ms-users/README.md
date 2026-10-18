# ms-users

Fundacion ejecutable del servicio de usuarios de MarketTec. Usa Java 21, Spring Boot 3.5 y Maven. No contiene autenticacion, persistencia ni endpoints de negocio.

## Requisitos y ejecucion

- JDK 21.
- Maven 3.6.3 o posterior, o el Maven Wrapper incluido.

```bash
cp .env.example .env # referencia; Spring lee las variables exportadas, no el archivo
export PORT=8080 SERVICE_NAME=ms-users
./mvnw spring-boot:run
curl -i http://localhost:8080/health
```

Pruebas y paquete ejecutable:

```bash
./mvnw test
./mvnw package
java -jar target/ms-users-0.1.0-SNAPSHOT.jar
```

## Arquitectura implementada

`HealthController` es el adaptador de entrada; invoca `GetHealthQuery`, implementado por `GetHealthService`, que devuelve el modelo puro `ServiceHealth`. `ApplicationConfig` compone las dependencias. ArchUnit verifica que las dependencias apunten hacia adentro, que dominio y aplicacion no importen Spring/Jakarta ni capas externas y que no existan ciclos entre paquetes superiores.

Las rutas de negocio futuras usarán `/v1`. Persistencia, Google/JWT, eventos y Azure se añadirán como puertos de salida y adaptadores solo al implementar sus casos de uso. `X-Correlation-ID` se propaga o genera, los timestamps son Epoch seconds y los errores inesperados usan el envelope técnico documentado.
