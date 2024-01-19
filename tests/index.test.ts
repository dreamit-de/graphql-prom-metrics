import {
    GraphQLServer,
    GraphQLServerOptions,
    NoStacktraceJsonLogger,
} from '@dreamit/graphql-server'
import {
    FETCH_ERROR,
    GRAPHQL_ERROR,
    INVALID_SCHEMA_ERROR,
    METHOD_NOT_ALLOWED_ERROR,
    MISSING_QUERY_PARAMETER_ERROR,
    SCHEMA_VALIDATION_ERROR,
    SYNTAX_ERROR,
    VALIDATION_ERROR,
    MetricsClient,
} from '@dreamit/graphql-server-base'
import {
    buildSchema,
    GraphQLError,
    GraphQLSchema,
    NoSchemaIntrospectionCustomRule,
} from 'graphql'
import { PromMetricsClient } from '~/src'

const userSchema = buildSchema(`
  schema {
    query: Query
    mutation: Mutation
  }
  
  type Query {
    returnError: User 
    users: [User]
    user(id: String!): User
  }
  
  type Mutation {
    login(userName: String, password: String): LoginData
    logout: LogoutResult
  }
  
  type User {
    userId: String
    userName: String
  }
  
  type LoginData {
    jwt: String
  }
  
  type LogoutResult {
    result: String
  }
`)

const userSchemaResolvers = {
    returnError(): User {
        throw new GraphQLError('Something went wrong!', {})
    },
    users(): User[] {
        return [userOne, userTwo]
    },
    user(input: { id: string }): User {
        switch (input.id) {
            case '1': {
                return userOne
            }
            case '2': {
                return userTwo
            }
            default: {
                throw new GraphQLError(
                    `User for userid=${input.id} was not found`,
                    {},
                )
            }
        }
    },
    logout(): LogoutResult {
        return { result: 'Goodbye!' }
    },
}

const LOGGER = new NoStacktraceJsonLogger(
    'nostack-logger',
    'myTestService',
    false,
)

interface User {
    userId: string
    userName: string
}

interface LogoutResult {
    result: string
}

const initialSchemaWithOnlyDescription = new GraphQLSchema({
    description: 'initial',
})

const userOne: User = { userId: '1', userName: 'UserOne' }
const userTwo: User = { userId: '2', userName: 'UserTwo' }

const usersQuery = 'query users{ users { userId userName } }'
const returnErrorQuery = 'query returnError{ returnError { userId } }'

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
        schema: initialSchemaWithOnlyDescription,
        rootValue: userSchemaResolvers,
        logger: LOGGER,
        metricsClient: metricsClient,
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
        query: returnErrorQuery,
        method: 'POST',
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': '',
        },
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
        schema: userSchema,
        rootValue: userSchemaResolvers,
        logger: LOGGER,
        metricsClient: metricsClient,
        executeFunction: () => {
            throw new GraphQLError(
                'FetchError: ' +
                    'An error occurred while connecting to following endpoint',
                {},
            )
        },
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
): GraphQLServerOptions {
    return {
        schema: userSchema,
        rootValue: userSchemaResolvers,
        logger: LOGGER,
        customValidationRules: [NoSchemaIntrospectionCustomRule],
        metricsClient: metricsClient,
    }
}

async function getMetricsData(): Promise<string> {
    return await customGraphQLServer.getMetrics()
}
