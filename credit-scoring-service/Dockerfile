FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /workspace

COPY pom.xml .
COPY loanflow-common ./loanflow-common
COPY application-service ./application-service
COPY credit-scoring-service ./credit-scoring-service
COPY underwriting-service ./underwriting-service
COPY disbursement-service ./disbursement-service
COPY notification-service ./notification-service

RUN mvn clean package -pl loanflow-common,credit-scoring-service -am -DskipTests

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
COPY --from=builder /workspace/credit-scoring-service/target/*.jar app.jar
EXPOSE 8082
ENTRYPOINT ["java", "-jar", "app.jar"]
