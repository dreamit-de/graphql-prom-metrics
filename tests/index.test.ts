import { GraphQLServer, NoStacktraceJsonLogger } from '@dreamit/graphql-server'
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import type { GraphQLServerOptions } from '@dreamit/graphql-server'
import {
    FETCH_ERROR,
    GRAPHQL_ERROR,
    INVALID_SCHEMA_ERROR,
    METHOD_NOT_ALLOWED_ERROR,
    MISSING_QUERY_PARAMETER_ERROR,
    SCHEMA_VALIDATION_ERROR,
    SYNTAX_ERROR,
    VALIDATION_ERROR,
} from '@dreamit/graphql-server-base'
// eslint-disable-next-line @typescript-eslint/no-duplicate-imports
import type { MetricsClient } from '@dreamit/graphql-server-base'
import {
    returnErrorQuery,
    userSchema,
    userSchemaResolvers,
    usersQuery,
} from '@dreamit/graphql-testing'
import {
    GraphQLError,
    GraphQLSchema,
    NoSchemaIntrospectionCustomRule,
} from 'graphql'
import { expect, test } from 'vitest'
import { PromMetricsClient } from '~/src'

const LOGGER = new NoStacktraceJsonLogger(
    'nostack-logger',
    'myTestService',
    false,
)

const initialSchemaWithOnlyDescription = new GraphQLSchema({
    description: 'initial',
})

const metricsClient = new PromMetricsClient()
const customGraphQLServer = new GraphQLServer(
    getInitialGraphQLServerOptions(metricsClient),
)
let metricsData: string

test('Should get correct metrics for PromMetricsClient', async () => {
    await testInitialMetrics()
    await testInvalidSchemaMetrics(metricsClient)
    await testValidResponseMetrics()
    await testErrorResponseMetrics()
    await testEmptyContentResponseMetrics()
    await testFetchErrorResponseMetrics(metricsClient)
})

/**
 * Test:
 * When called before anything else availability should be 1 and the rest
 * of the counters and gauges should be 0
 */
async function testInitialMetrics(): Promise<void> {
    const contentType = customGraphQLServer.getMetricsContentType()
    expect(contentType).toContain('text/plain')
    expect(contentType).toContain('charset=utf-8')
    metricsData = await getMetricsData()
    expect(metricsData).toContain('graphql_server_availability 1')
    expect(metricsData).toContain('graphql_server_request_throughput 0')
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${GRAPHQL_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SCHEMA_VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${FETCH_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${METHOD_NOT_ALLOWED_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${INVALID_SCHEMA_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${MISSING_QUERY_PARAMETER_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SYNTAX_ERROR}"} 0`,
    )
}

/**
 * Test:
 * When schema is invalid, availability should be 0. As only metrics endpoint
 * is being called, request_throughput should stay at 0,
 * SchemaValidationError should increase to 1 and GraphQLError counter should stay at 0
 */
async function testInvalidSchemaMetrics(
    metricsClient: MetricsClient,
): Promise<void> {
    customGraphQLServer.setOptions({
        logger: LOGGER,
        metricsClient: metricsClient,
        rootValue: userSchemaResolvers,
        schema: initialSchemaWithOnlyDescription,
        shouldUpdateSchemaFunction: () => true,
    })
    metricsData = await getMetricsData()

    expect(metricsData).toContain('graphql_server_availability 0')
    expect(metricsData).toContain('graphql_server_request_throughput 0')
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${GRAPHQL_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SCHEMA_VALIDATION_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${FETCH_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${METHOD_NOT_ALLOWED_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${INVALID_SCHEMA_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${MISSING_QUERY_PARAMETER_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SYNTAX_ERROR}"} 0`,
    )

    customGraphQLServer.setOptions(
        getInitialGraphQLServerOptions(metricsClient),
    )
}

/**
 * Test:
 * With working schema, availability should be 1.
 * When sending request with valid data response,
 * request_throughput should increase to 1.
 */
async function testValidResponseMetrics(): Promise<void> {
    await customGraphQLServer.handleRequest({ query: usersQuery })
    metricsData = await getMetricsData()

    expect(metricsData).toContain('graphql_server_availability 1')
    expect(metricsData).toContain('graphql_server_request_throughput 1')
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${GRAPHQL_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SCHEMA_VALIDATION_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${FETCH_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${METHOD_NOT_ALLOWED_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${INVALID_SCHEMA_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${MISSING_QUERY_PARAMETER_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SYNTAX_ERROR}"} 0`,
    )
}

/**
 * Test:
 * When sending request that returns GraphQL error,
 * GraphQLError counter and request throughput should increase by 1
 */
async function testErrorResponseMetrics(): Promise<void> {
    await customGraphQLServer.handleRequest({ query: returnErrorQuery })
    metricsData = await getMetricsData()

    expect(metricsData).toContain('graphql_server_availability 1')
    expect(metricsData).toContain('graphql_server_request_throughput 2')
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${GRAPHQL_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SCHEMA_VALIDATION_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${FETCH_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${METHOD_NOT_ALLOWED_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${INVALID_SCHEMA_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${MISSING_QUERY_PARAMETER_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SYNTAX_ERROR}"} 0`,
    )
}

/**
 * Test:
 * When sending request with empty content type GraphQL error,
 * GraphQLError counter and request throughput should increase by 1
 */
async function testEmptyContentResponseMetrics(): Promise<void> {
    await customGraphQLServer.handleRequest({
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': '',
        },
        method: 'POST',
        query: returnErrorQuery,
    })

    metricsData = await getMetricsData()

    expect(metricsData).toContain('graphql_server_availability 1')
    expect(metricsData).toContain('graphql_server_request_throughput 3')
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${GRAPHQL_ERROR}"} 2`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SCHEMA_VALIDATION_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${FETCH_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${METHOD_NOT_ALLOWED_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${INVALID_SCHEMA_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${MISSING_QUERY_PARAMETER_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SYNTAX_ERROR}"} 0`,
    )
}

/**
 * Test:
 * When forcing a FetchError in execute function,
 * FetchError counter and request throughput should increase by 1
 */
async function testFetchErrorResponseMetrics(
    metricsClient: MetricsClient,
): Promise<void> {
    customGraphQLServer.setOptions({
        executeFunction: () => {
            throw new GraphQLError(
                'FetchError: ' +
                    'An error occurred while connecting to following endpoint',
                {},
            )
        },
        logger: LOGGER,
        metricsClient: metricsClient,
        rootValue: userSchemaResolvers,
        schema: userSchema,
    })

    await customGraphQLServer.handleRequest({ query: usersQuery })
    metricsData = await getMetricsData()

    expect(metricsData).toContain('graphql_server_availability 1')
    expect(metricsData).toContain('graphql_server_request_throughput 4')
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${GRAPHQL_ERROR}"} 2`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SCHEMA_VALIDATION_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${FETCH_ERROR}"} 1`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${METHOD_NOT_ALLOWED_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${INVALID_SCHEMA_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${MISSING_QUERY_PARAMETER_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${VALIDATION_ERROR}"} 0`,
    )
    expect(metricsData).toContain(
        `graphql_server_errors{errorClass="${SYNTAX_ERROR}"} 0`,
    )
    customGraphQLServer.setOptions(
        getInitialGraphQLServerOptions(metricsClient),
    )
}

function getInitialGraphQLServerOptions(
    metricsClient: MetricsClient,
): Partial<GraphQLServerOptions> {
    return {
        customValidationRules: [NoSchemaIntrospectionCustomRule],
        logger: LOGGER,
        metricsClient: metricsClient,
        rootValue: userSchemaResolvers,
        schema: userSchema,
    }
}

async function getMetricsData(): Promise<string> {
    return await customGraphQLServer.getMetrics()
}
