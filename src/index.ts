import {
    FETCH_ERROR,
    GRAPHQL_ERROR,
    INTROSPECTION_DISABLED_ERROR,
    INVALID_SCHEMA_ERROR,
    METHOD_NOT_ALLOWED_ERROR,
    MISSING_QUERY_PARAMETER_ERROR,
    SCHEMA_VALIDATION_ERROR,
    SYNTAX_ERROR,
    VALIDATION_ERROR,
} from '@dreamit/graphql-server-base'
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import type { MetricsClient } from '@dreamit/graphql-server-base'
import prom from 'prom-client'
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import type { Counter, Gauge } from 'prom-client'

/**
 * Metrics client using prom-client library, to collect metrics from application and GraphQL server.
 */
export class PromMetricsClient implements MetricsClient {
    readonly requestThroughputMetricName: string
    readonly availabilityMetricName: string
    readonly errorsMetricName: string
    graphQLServerAvailabilityGauge!: Gauge<string>
    requestThroughput!: Counter<string>
    graphQLServerErrorCounter!: Counter<string>

    constructor(
        requestThroughputMetricName = 'graphql_server_request_throughput',
        availabilityMetricName = 'graphql_server_availability',
        errorsMetricName = 'graphql_server_errors',
    ) {
        this.requestThroughputMetricName = requestThroughputMetricName
        this.availabilityMetricName = availabilityMetricName
        this.errorsMetricName = errorsMetricName
        this.initMetrics()
    }

    initMetrics(): void {
        prom.register.clear()
        prom.collectDefaultMetrics()
        this.createRequestThroughputCounter()
        this.createServerAvailabilityGauge()
        this.createServerErrorCounter()
        this.initErrorCounterLabels()
    }

    createServerErrorCounter(): void {
        this.graphQLServerErrorCounter = new prom.Counter({
            help: 'Number of errors per Error class',
            labelNames: ['errorClass'],
            name: this.errorsMetricName,
        })
    }

    createServerAvailabilityGauge(): void {
        this.graphQLServerAvailabilityGauge = new prom.Gauge({
            help: 'GraphQL server availability',
            name: this.availabilityMetricName,
        })
    }

    createRequestThroughputCounter(): void {
        this.requestThroughput = new prom.Counter({
            help: 'Number of incoming requests',
            name: this.requestThroughputMetricName,
        })
    }

    /**
     * Initializes the error counter.
     * When evaluating time series this can help
     * to create an initial time series that can be used for actions like alerting.
     * Otherwise calculating differences with functions like "increase" with
     * an undefined time series might not work for the first occurrence of an error.
     */
    initErrorCounterLabels(): void {
        this.graphQLServerErrorCounter.labels(GRAPHQL_ERROR).inc(0)
        this.graphQLServerErrorCounter.labels(SCHEMA_VALIDATION_ERROR).inc(0)
        this.graphQLServerErrorCounter.labels(FETCH_ERROR).inc(0)
        this.graphQLServerErrorCounter.labels(METHOD_NOT_ALLOWED_ERROR).inc(0)
        this.graphQLServerErrorCounter.labels(INVALID_SCHEMA_ERROR).inc(0)
        this.graphQLServerErrorCounter
            .labels(MISSING_QUERY_PARAMETER_ERROR)
            .inc(0)
        this.graphQLServerErrorCounter.labels(VALIDATION_ERROR).inc(0)
        this.graphQLServerErrorCounter.labels(SYNTAX_ERROR).inc(0)
        this.graphQLServerErrorCounter
            .labels(INTROSPECTION_DISABLED_ERROR)
            .inc(0)
    }

    increaseErrors(label: string): void {
        this.graphQLServerErrorCounter.labels(label).inc()
    }

    increaseRequestThroughput(): void {
        this.requestThroughput.inc()
    }

    setAvailability(value: number): void {
        this.graphQLServerAvailabilityGauge.set(value)
    }

    getMetricsContentType(): string {
        return prom.register.contentType
    }

    async getMetrics(): Promise<string> {
        return prom.register.metrics()
    }
}
